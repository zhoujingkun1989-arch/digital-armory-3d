import * as THREE from 'three';
import {
  clampUv01 as clamp01,
  fractPos,
  sampleTriangleInfo as triInfo,
} from '../../../engine/geometry/uvUnwrap';
import {
  createChamferedBox,
  createMilStdPicatinnyRail,
  csgSubtract,
  csgUnion,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import {
  attachRigidFlexParam,
  createFlexLimbBlade,
  extrudeAlongY,
  extrudeAlongZ,
  mergeCutters,
  sanitizeR500Mesh,
} from './r500CadDetail';

// Ravin R500 Tactical Palette (calibrated above Khronos near-black floor)
export const R500_CHASSIS_GUNMETAL = '#39424f';
export const R500_CHASSIS_CHAMFER = '#526072';
export const R500_INNER_DARK = '#252b35';
export const R500_POLY_GRAPHITE = '#2d333d';
export const R500_POLY_DARK = '#242933';
export const R500_RUBBER_PAD = '#22262e';
export const R500_CARBON_WEAVE = '#323842';
export const R500_STAINLESS = '#cbd5e1';
export const R500_CHROME = '#e2e8f0';
export const R500_BRONZE_CAM = '#c78c38';
export const R500_GOLD_ACCENT = '#dfb25b';
export const R500_STRING_SERVED = '#64748b';
export const R500_STRING_NOOK = '#cbd5e1';
export const R500_SAFETY_ORANGE = '#ea580c';
export const R500_SCOPE_MATTE = '#303742';
export const R500_LENS_EMERALD = '#0d9488';
export const R500_CARBON_SHAFT = '#343b46';
export const R500_BROADHEAD_STEEL = '#d4dde8';
export const R500_BRASS_NOCK = '#d9a434';

// ============================================================================
// 1. PRECISION 2K UV ATLAS UNWRAPPERS (`r500_chassis_*` & `r500_limbs_*`)
// ============================================================================

/**
 * Unwraps B-01 Bullpup Chassis onto `r500_chassis_*` (2048x1024):
 *  - Left flank  (v in [0.05, 0.29], u in [0.04, 0.96])
 *  - Right flank (v in [0.31, 0.55], u in [0.04, 0.96])
 *  - Internal slide channel / top track: v in [0.01, 0.04], u in [0.04, 0.72]
 */
export function applyR500ChassisUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let mode: 'right' | 'left' | 'inner' = 'inner';
    if (fnz > 0.35 && cz > 0.35) mode = 'right';
    else if (fnz < -0.35 && cz < -0.35) mode = 'left';

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x + 24.5) / 48.7);
      const yNorm = clamp01((y + 2.1) / 4.8);

      let u: number;
      let v: number;
      if (mode === 'left') {
        u = 0.04 + (1.0 - xNorm) * 0.92;
        v = 0.05 + yNorm * 0.24;
      } else if (mode === 'right') {
        u = 0.04 + xNorm * 0.92;
        v = 0.31 + yNorm * 0.24;
      } else {
        u = 0.04 + xNorm * 0.68;
        v = 0.01 + clamp01((z + 1.42) / 2.84) * 0.03;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps B-06 Cantilever Optical Bridge & Picatinny Rail onto `r500_chassis_*`
 * middle band (v in [0.58, 0.78]).
 */
export function applyR500FlightRailUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cy } = triInfo(pos, col, i, i + 1, i + 2);
    const isRailTeeth = cy > 0.15;
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x + 18.2) / 36.0);
      const yNorm = clamp01((y + 2.3) / 3.1);

      let u: number;
      let v: number;
      if (isRailTeeth) {
        u = 0.76 + fractPos((x + z) * 0.32) * 0.2;
        v = 0.59 + yNorm * 0.18;
      } else {
        u = 0.04 + xNorm * 0.7;
        v = 0.59 + yNorm * 0.19;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps T-01 Trac-Trigger Floating Sled onto `r500_chassis_*` upper-left band
 * (u in [0.05, 0.64], v in [0.80, 0.96]).
 */
export function applyR500SledUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const xNorm = clamp01((pos.getX(i) + 2.0) / 4.2);
    const yNorm = clamp01((pos.getY(i) + 0.9) / 2.0);
    uvs[i * 2] = clamp01(0.05 + xNorm * 0.58);
    uvs[i * 2 + 1] = clamp01(0.805 + yNorm * 0.155);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps B-05 Foot Stirrup onto `r500_chassis_*` upper-right stainless band
 * (u in [0.68, 0.96], v in [0.80, 0.96]).
 */
export function applyR500StirrupUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const xNorm = clamp01((pos.getX(i) + 4.8) / 9.8);
    const zNorm = clamp01((pos.getZ(i) + 5.2) / 10.4);
    uvs[i * 2] = clamp01(0.68 + xNorm * 0.27);
    uvs[i * 2 + 1] = clamp01(0.805 + zNorm * 0.155);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps H-02 / H-03 Split Quad Carbon Limbs onto `r500_limbs_*` bottom 3K carbon band
 * (u in [0.04, 0.96], v in [0.03, 0.27]).
 */
export function applyR500LimbUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const zAbs = Math.min(1, Math.abs(pos.getZ(i)) / 7.5);
    const xNorm = clamp01((pos.getX(i) + 1.8) / 3.4);
    uvs[i * 2] = clamp01(0.04 + zAbs * 0.92);
    uvs[i * 2 + 1] = clamp01(0.03 + xNorm * 0.24);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps H-04 / H-05 HexCoil 360° Helical Cams onto `r500_limbs_*` bronze-gold band
 * (v in [0.31, 0.54]).
 */
export function applyR500CamUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr, cg } = triInfo(pos, col, i, i + 1, i + 2);
    const isRim = cr > 0.65 && cg > 0.55;
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const ang01 = (Math.atan2(z, x) + Math.PI) / (Math.PI * 2);
      const yNorm = clamp01((y + 0.78) / 1.56);

      let u: number;
      let v: number;
      if (isRim) {
        u = 0.77 + fractPos(ang01 * 2.0) * 0.19;
        v = 0.31 + yNorm * 0.23;
      } else {
        u = 0.04 + ang01 * 0.7;
        v = 0.31 + yNorm * 0.23;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps Q-01 1-8x24 Crossbow Scope onto `r500_limbs_*` scope band (v in [0.58, 0.77]).
 */
export function applyR500ScopeUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr, cg, cb } = triInfo(pos, col, i, i + 1, i + 2);
    const isLens = cg > cr + 0.08 && cb > cr + 0.08;
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (isLens) {
        u = 0.78 + clamp01((z + 1.55) / 3.1) * 0.19;
        v = 0.58 + clamp01((y - 0.7 + 1.55) / 3.1) * 0.18;
      } else {
        u = 0.04 + clamp01((x + 11.2) / 24.5) * 0.7;
        v = 0.58 + clamp01((y + 1.8) / 4.2) * 0.19;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps tactical polymer parts (grips, buttstock, quiver frame) onto `r500_limbs_*`
 * top polymer/stipple band (u in [0.04, 0.96], v in [0.80, 0.97]).
 */
export function applyR500PolymerUVs(
  geo: THREE.BufferGeometry,
  xMin: number,
  xSpan: number,
  yMin: number,
  ySpan: number
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const u = 0.04 + clamp01((pos.getX(i) - xMin) / xSpan) * 0.92;
    const v = 0.805 + clamp01((pos.getY(i) - yMin) / ySpan) * 0.16;
    uvs[i * 2] = clamp01(u);
    uvs[i * 2 + 1] = clamp01(v);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// 2. 'frame': CHASSIS, GRIPS, STOCK, STIRRUP & FLIGHT BRIDGE (B-01 .. B-06)
// ============================================================================

/**
 * B-01: CNC Billet Aluminum Skeletonized Bullpup Mainframe (`isShell: true`)
 * World span: X in [-24.5, +24.2], Y in [-2.15, +2.65], Z in [-1.42, +1.42].
 * Features hollow internal VersaDrive / Trac-Trigger track bore, top string-latch slot,
 * raised cheek rest, CNC flank truss windows & right-flank QD quiver mounting boss.
 */
export function buildR500ChassisGeometry(): THREE.BufferGeometry {
  const mainBody = paintGeometry(
    createChamferedBox(48.7, 3.43, 2.84, 0.09, R500_CHASSIS_GUNMETAL).translate(
      -0.15,
      -0.035,
      0
    ),
    R500_CHASSIS_GUNMETAL
  );
  const topTrackRails = paintGeometry(
    createChamferedBox(48.5, 0.56, 2.8, 0.06, R500_CHASSIS_CHAMFER).translate(
      -0.15,
      1.56,
      0
    ),
    R500_CHASSIS_CHAMFER
  );
  const cheekRest = paintGeometry(
    createChamferedBox(10.3, 1.05, 2.66, 0.12, R500_CHASSIS_GUNMETAL).translate(
      -19.35,
      2.12,
      0
    ),
    R500_CHASSIS_GUNMETAL
  );
  const lowerNeck = paintGeometry(
    createChamferedBox(6.8, 0.65, 1.78, 0.06, R500_CHASSIS_GUNMETAL).translate(
      2.1,
      -1.82,
      0
    ),
    R500_CHASSIS_GUNMETAL
  );
  const quiverMountBoss = paintGeometry(
    createChamferedBox(5.6, 1.05, 0.52, 0.06, R500_CHASSIS_CHAMFER).translate(
      10.8,
      -1.25,
      1.6
    ),
    R500_CHASSIS_CHAMFER
  );

  const blank = csgUnion([
    mainBody,
    topTrackRails,
    cheekRest,
    lowerNeck,
    quiverMountBoss,
  ]);

  // Subtractions: internal VersaDrive bore, top string latch slot, lower trigger channel & 4 CNC truss windows
  const boreCutter = new THREE.BoxGeometry(43.2, 2.16, 1.88).translate(
    -3.8,
    0.48,
    0
  );
  const topSlotCutter = new THREE.BoxGeometry(50.2, 1.8, 0.96).translate(
    -0.1,
    2.15,
    0
  );
  const lowerTriggerSlot = new THREE.BoxGeometry(30.4, 2.15, 0.82).translate(
    -9.4,
    -1.15,
    0
  );
  const windowCutters: THREE.BufferGeometry[] = [];
  for (const wx of [-15.2, -8.2, 1.6, 8.8, 16.0]) {
    windowCutters.push(
      new THREE.BoxGeometry(4.2, 0.88, 3.2).translate(wx, 0.55, 0)
    );
  }

  const cutters = mergeCutters(
    [boreCutter, topSlotCutter, lowerTriggerSlot, ...windowCutters],
    R500_INNER_DARK
  );
  const machined = csgSubtract(blank, [cutters]);
  blank.dispose();
  cutters.dispose();

  return sanitizeR500Mesh(applyR500ChassisUVs(machined));
}

/**
 * B-02: Forend Grip with Wide Anti-Thumb Safety Finger Wings
 * assembledPos: [14.2, -1.85, 0]
 */
export function buildR500ForendGripGeometry(): THREE.BufferGeometry {
  const body = createChamferedBox(
    14.8,
    1.55,
    2.76,
    0.1,
    R500_POLY_GRAPHITE
  ).translate(0, 0.55, 0);

  // Flared horizontal anti-thumb safety wings extending to Z = ±3.15
  const wingShape = new THREE.Shape();
  wingShape.moveTo(-6.8, -3.12);
  wingShape.lineTo(5.8, -3.12);
  wingShape.quadraticCurveTo(7.1, -2.9, 7.2, -1.4);
  wingShape.lineTo(7.2, 1.4);
  wingShape.quadraticCurveTo(7.1, 2.9, 5.8, 3.12);
  wingShape.lineTo(-6.8, 3.12);
  wingShape.quadraticCurveTo(-7.6, 2.6, -7.6, 1.4);
  wingShape.lineTo(-7.6, -1.4);
  wingShape.quadraticCurveTo(-7.6, -2.6, -6.8, -3.12);
  wingShape.closePath();
  const safetyWings = extrudeAlongY(
    wingShape,
    1.76,
    0.58,
    R500_POLY_DARK,
    0.08,
    10
  );

  // Molded ergonomic lower hand-stop & finger scallops
  const handStop = createChamferedBox(
    1.6,
    1.25,
    2.55,
    0.12,
    R500_POLY_DARK
  ).translate(5.8, -0.45, 0);
  const rearHook = createChamferedBox(
    1.8,
    1.05,
    2.55,
    0.12,
    R500_POLY_DARK
  ).translate(-6.2, -0.35, 0);

  const gripRibs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    gripRibs.push(
      createChamferedBox(
        1.1,
        0.55,
        2.62,
        0.08,
        R500_POLY_GRAPHITE
      ).translate(-3.8 + i * 2.4, -0.25, 0)
    );
  }

  const merged = mergeParts([
    body,
    safetyWings,
    handStop,
    rearHook,
    ...gripRibs,
  ]);
  return sanitizeR500Mesh(applyR500PolymerUVs(merged, -7.8, 15.4, -1.2, 3.6));
}

/**
 * B-03: Ergonomic Bullpup Pistol Grip & Integrated Winter Trigger Guard
 * assembledPos: [1.6, -4.8, 0]
 */
export function buildR500PistolGripGeometry(): THREE.BufferGeometry {
  // Profile in (X, Y) extruded along Z
  const gripShape = new THREE.Shape();
  gripShape.moveTo(-1.1, 3.15);
  gripShape.lineTo(1.5, 3.15);
  gripShape.quadraticCurveTo(1.65, 1.9, 0.95, 1.2);
  gripShape.quadraticCurveTo(0.85, -1.8, 0.25, -6.1);
  gripShape.lineTo(-2.55, -6.4);
  gripShape.quadraticCurveTo(-2.25, -2.5, -1.45, 1.5);
  gripShape.closePath();
  const gripBody = extrudeAlongZ(
    gripShape,
    -0.9,
    1.8,
    R500_POLY_GRAPHITE,
    0.14,
    10
  );

  // Palm swell grip scales
  const gripSwell = createChamferedBox(
    2.2,
    5.4,
    2.02,
    0.18,
    R500_POLY_DARK
  )
    .rotateZ(-0.26)
    .translate(-0.7, -1.9, 0);

  // Trigger guard bow sweeping forward from local X=0.75 to X=3.85 around trigger shoe
  const guardShape = new THREE.Shape();
  guardShape.moveTo(0.5, 3.12);
  guardShape.lineTo(4.05, 3.12);
  guardShape.lineTo(4.05, 1.45);
  guardShape.quadraticCurveTo(3.95, 0.3, 2.7, 0.22);
  guardShape.lineTo(0.45, 0.22);
  guardShape.lineTo(0.45, 0.68);
  guardShape.lineTo(2.65, 0.68);
  guardShape.quadraticCurveTo(3.45, 0.72, 3.55, 1.5);
  guardShape.lineTo(3.55, 2.68);
  guardShape.lineTo(0.5, 2.68);
  guardShape.closePath();
  const guardBow = extrudeAlongZ(
    guardShape,
    -0.7,
    1.4,
    R500_POLY_GRAPHITE,
    0.07,
    8
  );

  const merged = mergeParts([gripBody, gripSwell, guardBow]);
  return sanitizeR500Mesh(applyR500PolymerUVs(merged, -2.8, 7.0, -6.6, 10.0));
}

/**
 * B-04: Skeletonized Buttstock, VersaDrive Clutch Bore & Rubber Recoil Pad
 * assembledPos: [-27.8, -0.45, 0] -> world X in [-32.0, -24.3]
 */
export function buildR500ButtstockGeometry(): THREE.BufferGeometry {
  const stockShape = new THREE.Shape();
  stockShape.moveTo(-3.4, 2.25);
  stockShape.lineTo(3.5, 2.25);
  stockShape.lineTo(3.5, -1.25);
  stockShape.lineTo(-0.5, -5.65);
  stockShape.lineTo(-3.4, -5.85);
  stockShape.closePath();
  const stockFrame = extrudeAlongZ(
    stockShape,
    -1.56,
    3.12,
    R500_POLY_GRAPHITE,
    0.1,
    8
  );

  // Skeletonized triangular cutout + cylindrical VersaDrive clutch pocket (centered at local Y = +1.0 -> world Y = +0.55)
  const triHole = new THREE.Shape();
  triHole.moveTo(-2.1, -0.8);
  triHole.lineTo(1.7, -0.8);
  triHole.lineTo(-1.8, -4.45);
  triHole.closePath();
  const triCutter = extrudeAlongZ(triHole, -1.8, 3.6, R500_INNER_DARK, 0);

  const clutchBore = new THREE.CylinderGeometry(1.46, 1.46, 7.6, 28)
    .rotateZ(Math.PI / 2)
    .translate(0.1, 1.0, 0);

  const cutters = mergeCutters([triCutter, clutchBore], R500_INNER_DARK);
  const hollowedStock = csgSubtract(stockFrame, [cutters]);
  stockFrame.dispose();
  cutters.dispose();

  // Textured rubber recoil buttpad at rear X = -4.2 .. -3.25
  const buttPad = createChamferedBox(
    0.95,
    8.2,
    3.24,
    0.14,
    R500_RUBBER_PAD
  ).translate(-3.72, -1.85, 0);

  // Top VersaDrive clutch housing shroud arch
  const clutchRing = createChamferedBox(
    7.0,
    0.65,
    2.96,
    0.08,
    R500_POLY_DARK
  ).translate(0.05, 2.28, 0);

  const merged = mergeParts([hollowedStock, buttPad, clutchRing]);
  return sanitizeR500Mesh(applyR500PolymerUVs(merged, -4.2, 7.8, -6.2, 8.8));
}

/**
 * B-05: Folding Stainless-Steel Cocking Foot Stirrup
 * assembledPos: [34.0, 1.15, 0] -> world X in [+29.5, +39.0]
 */
export function buildR500FootStirrupGeometry(): THREE.BufferGeometry {
  const stirrupShape = new THREE.Shape();
  // U-loop in (X, Z) extruded along Y, then joined with forward lowered boot bar
  stirrupShape.moveTo(-4.5, -2.55);
  stirrupShape.lineTo(-3.2, -2.55);
  stirrupShape.lineTo(-1.2, -4.95);
  stirrupShape.lineTo(3.8, -4.95);
  stirrupShape.quadraticCurveTo(4.95, -4.85, 4.95, -3.5);
  stirrupShape.lineTo(4.95, 3.5);
  stirrupShape.quadraticCurveTo(4.95, 4.85, 3.8, 4.95);
  stirrupShape.lineTo(-1.2, 4.95);
  stirrupShape.lineTo(-3.2, 2.55);
  stirrupShape.lineTo(-4.5, 2.55);
  stirrupShape.lineTo(-4.5, 1.82);
  stirrupShape.lineTo(-2.8, 1.82);
  stirrupShape.lineTo(-0.85, 4.22);
  stirrupShape.lineTo(3.55, 4.22);
  stirrupShape.quadraticCurveTo(4.2, 4.18, 4.2, 3.35);
  stirrupShape.lineTo(4.2, -3.35);
  stirrupShape.quadraticCurveTo(4.2, -4.18, 3.55, -4.22);
  stirrupShape.lineTo(-0.85, -4.22);
  stirrupShape.lineTo(-2.8, -1.82);
  stirrupShape.lineTo(-4.5, -1.82);
  stirrupShape.closePath();

  const loopBar = extrudeAlongY(
    stirrupShape,
    -0.82,
    0.72,
    R500_STAINLESS,
    0.07,
    10
  );

  // Rear mounting clevis knuckles bolting into riser nose at X = -4.5 (world +29.5)
  const knuckleL = createChamferedBox(
    1.15,
    0.92,
    0.85,
    0.06,
    R500_CHROME
  ).translate(-4.35, -0.25, -2.2);
  const knuckleR = createChamferedBox(
    1.15,
    0.92,
    0.85,
    0.06,
    R500_CHROME
  ).translate(-4.35, -0.25, 2.2);

  // Serrated forward foot-pad rubber/steel sleeve at X = +4.55 (world +38.55, Y = +0.69 -> well below Y=+1.80 flight axis)
  const footGrip = createChamferedBox(
    0.88,
    0.88,
    6.4,
    0.08,
    R500_CHROME
  ).translate(4.55, -0.46, 0);

  const merged = mergeParts([loopBar, knuckleL, knuckleR, footGrip]);
  return sanitizeR500Mesh(applyR500StirrupUVs(merged));
}

/**
 * B-06: Frictionless Zero-Rail Cantilevered Top Optical Bridge & MIL-STD-1913 Scope Rail
 * assembledPos: [-7.0, 3.85, 0] -> world X in [-25.2, +10.8], rail crown world Y = +4.60.
 * Rear side-straddle pylons bolt onto chassis exterior at X in [-25.2, -22.5], Z = ±1.42
 * so internal sled & -22.0 bowstring travel with 100% clearance.
 */
export function buildR500FlightRailGeometry(): THREE.BufferGeometry {
  // Cantilevered upper CNC spine beam (local Y in [-0.45, -0.05] -> world Y in [3.40, 3.80])
  const spineBeam = createChamferedBox(
    36.0,
    0.48,
    2.46,
    0.06,
    R500_CHASSIS_GUNMETAL
  ).translate(-0.2, -0.26, 0);

  // Side truss ribs along cantilevered bridge
  const sideRibL = createChamferedBox(
    33.4,
    0.34,
    0.26,
    0.04,
    R500_CHASSIS_CHAMFER
  ).translate(-0.2, -0.58, -1.06);
  const sideRibR = createChamferedBox(
    33.4,
    0.34,
    0.26,
    0.04,
    R500_CHASSIS_CHAMFER
  ).translate(-0.2, -0.58, 1.06);

  // Twin rear outer-flank mounting buttresses (Z = ±1.44, X in [-18.2, -15.5], local Y in [-2.30, -0.05])
  const pylonShape = new THREE.Shape();
  pylonShape.moveTo(-18.2, -2.32);
  pylonShape.lineTo(-15.5, -2.32);
  pylonShape.lineTo(-15.5, -0.06);
  pylonShape.lineTo(-18.2, -0.06);
  pylonShape.closePath();
  const pylonL = extrudeAlongZ(
    pylonShape,
    -1.66,
    0.44,
    R500_CHASSIS_GUNMETAL,
    0.04,
    6
  );
  const pylonR = extrudeAlongZ(
    pylonShape,
    1.22,
    0.44,
    R500_CHASSIS_GUNMETAL,
    0.04,
    6
  );
  const rearArchCap = createChamferedBox(
    2.9,
    0.58,
    3.32,
    0.06,
    R500_CHASSIS_CHAMFER
  ).translate(-16.85, -0.15, 0);

  // True MIL-STD-1913 Picatinny scope rail (crown at local Y = +0.75 -> world Y = +4.60)
  const picatinny = createMilStdPicatinnyRail(
    24.5,
    -12.5,
    0.75,
    2.12,
    R500_CHASSIS_CHAMFER
  );

  const merged = mergeParts([
    spineBeam,
    sideRibL,
    sideRibR,
    pylonL,
    pylonR,
    rearArchCap,
    picatinny,
  ]);
  return sanitizeR500Mesh(applyR500FlightRailUVs(merged));
}

// ============================================================================
// 3. 'slide': RISER, SPLIT QUAD CARBON LIMBS, HEXCOIL CAMS & AXLES (H-01..H-06)
// ============================================================================

/**
 * H-01: Forward CNC Billet Riser Block & Angled Quad Limb Pockets
 * assembledPos: [26.2, 1.75, 0] -> world X in [+23.8, +29.8]
 */
export function buildR500RiserHeadGeometry(): THREE.BufferGeometry {
  const riserBody = createChamferedBox(
    5.6,
    3.35,
    5.8,
    0.12,
    R500_CHASSIS_GUNMETAL
  ).translate(0.4, 0.05, 0);

  // Angled upper & lower limb pockets flanking Z = ±2.40
  const pocketL = createChamferedBox(
    3.4,
    3.1,
    1.6,
    0.08,
    R500_CHASSIS_CHAMFER
  )
    .rotateY(0.28)
    .translate(0.35, 0.05, -2.55);
  const pocketR = createChamferedBox(
    3.4,
    3.1,
    1.6,
    0.08,
    R500_CHASSIS_CHAMFER
  )
    .rotateY(-0.28)
    .translate(0.35, 0.05, 2.55);

  const rawRiser = csgUnion([riserBody, pocketL, pocketR]);

  // Cut out central arrow flight channel (local Y >= -0.35, Z in [-0.95, +0.95]),
  // limb pocket recesses, and CNC lightening truss slots
  const arrowTunnel = new THREE.BoxGeometry(6.8, 2.55, 1.92).translate(
    0.5,
    0.92,
    0
  );
  const camShelfL = new THREE.BoxGeometry(4.2, 1.24, 1.9).translate(
    0.2,
    0.05,
    -2.75
  );
  const camShelfR = new THREE.BoxGeometry(4.2, 1.24, 1.9).translate(
    0.2,
    0.05,
    2.75
  );
  const lightSlotL = new THREE.BoxGeometry(1.9, 1.6, 2.4).translate(
    1.9,
    -0.55,
    -1.6
  );
  const lightSlotR = new THREE.BoxGeometry(1.9, 1.6, 2.4).translate(
    1.9,
    -0.55,
    1.6
  );

  const cutters = mergeCutters(
    [arrowTunnel, camShelfL, camShelfR, lightSlotL, lightSlotR],
    R500_INNER_DARK
  );
  const machinedRiser = csgSubtract(rawRiser, [cutters]);
  rawRiser.dispose();
  cutters.dispose();

  // Front frictionless V-rest roller pins cradling bolt shaft (world Y = +1.35)
  const restRollerL = createChamferedBox(
    1.1,
    0.26,
    0.34,
    0.04,
    R500_STAINLESS
  )
    .rotateX(0.55)
    .translate(0.45, -0.36, -0.36);
  const restRollerR = createChamferedBox(
    1.1,
    0.26,
    0.34,
    0.04,
    R500_STAINLESS
  )
    .rotateX(-0.55)
    .translate(0.45, -0.36, 0.36);

  return sanitizeR500Mesh(
    mergeParts([machinedRiser, restRollerL, restRollerR])
  );
}

function buildHalfQuadLimbs(sideSign: -1 | 1): THREE.BufferGeometry {
  const steps = 26;
  const spineUpper: THREE.Vector3[] = [];
  const spineLower: THREE.Vector3[] = [];

  // Pocket root at local (x=+0.6, z=0) -> cam axle yoke at local (x=-1.0, z=sideSign*7.25)
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const z = sideSign * 7.25 * u;
    const x = 0.6 + 1.15 * Math.sin(u * Math.PI * 0.65) - 2.35 * u * u;
    spineUpper.push(new THREE.Vector3(x, 0.85, z));
    spineLower.push(new THREE.Vector3(x, -0.85, z));
  }

  const tipDx = -1.8;
  const tipDz = -sideSign * 5.05; // pulls inward toward Z=0!
  const flexFn = (u: number): readonly [number, number, number] => {
    const b = Math.pow(u, 1.75);
    return [tipDx * b, 0, tipDz * b];
  };

  const upperBlade = createFlexLimbBlade({
    spinePts: spineUpper,
    halfWidthXAt: (u) => 1.15 - 0.55 * u,
    halfThickYAt: (u) => 0.34 - 0.14 * u,
    flexAt: flexFn,
    color: R500_CARBON_WEAVE,
  });
  const lowerBlade = createFlexLimbBlade({
    spinePts: spineLower,
    halfWidthXAt: (u) => 1.15 - 0.55 * u,
    halfThickYAt: (u) => 0.34 - 0.14 * u,
    flexAt: flexFn,
    color: R500_CARBON_WEAVE,
  });

  // CNC aluminum tip fork collars pinned to limb tip flex vector
  const tipCapU = attachRigidFlexParam(
    createChamferedBox(1.45, 0.48, 0.95, 0.06, R500_CHASSIS_CHAMFER).translate(
      -1.0,
      0.85,
      sideSign * 7.25
    ),
    tipDx,
    0,
    tipDz
  );
  const tipCapL = attachRigidFlexParam(
    createChamferedBox(1.45, 0.48, 0.95, 0.06, R500_CHASSIS_CHAMFER).translate(
      -1.0,
      -0.85,
      sideSign * 7.25
    ),
    tipDx,
    0,
    tipDz
  );

  const merged = mergeParts([upperBlade, lowerBlade, tipCapU, tipCapL]);
  return sanitizeR500Mesh(applyR500LimbUVs(merged));
}

/** H-02: Left Horizontal Split Quad Carbon Limbs (assembledPos: [26.2, 1.80, -2.40]) */
export function buildR500LeftLimbsGeometry(): THREE.BufferGeometry {
  return buildHalfQuadLimbs(-1);
}

/** H-03: Right Horizontal Split Quad Carbon Limbs (assembledPos: [26.2, 1.80, +2.40]) */
export function buildR500RightLimbsGeometry(): THREE.BufferGeometry {
  return buildHalfQuadLimbs(1);
}

function buildHexCoilCamGeometry(sideSign: -1 | 1): THREE.BufferGeometry {
  // Eccentric spiral HexCoil main string plate profile drawn in (X, Z) around axle (0, 0)
  const camShape = new THREE.Shape();
  const nPts = 36;
  for (let i = 0; i <= nPts; i++) {
    const t = i / nPts;
    const a = t * Math.PI * 2;
    // Eccentric binary spiral lobe: swells toward inward/forward power-stroke quadrant
    const r =
      1.34 +
      0.34 * Math.cos(a - sideSign * 0.55) +
      0.14 * Math.sin(2 * a + 0.4);
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;
    if (i === 0) camShape.moveTo(px, pz);
    else camShape.lineTo(px, pz);
  }
  camShape.closePath();

  const upperFlange = extrudeAlongY(
    camShape,
    0.08,
    0.16,
    R500_BRONZE_CAM,
    0.025,
    18
  );
  const lowerFlange = extrudeAlongY(
    camShape,
    -0.24,
    0.16,
    R500_BRONZE_CAM,
    0.025,
    18
  );

  // Recessed central bowstring track drum
  const trackShape = new THREE.Shape();
  for (let i = 0; i <= nPts; i++) {
    const a = (i / nPts) * Math.PI * 2;
    const r =
      1.16 +
      0.28 * Math.cos(a - sideSign * 0.55) +
      0.1 * Math.sin(2 * a + 0.4);
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;
    if (i === 0) trackShape.moveTo(px, pz);
    else trackShape.lineTo(px, pz);
  }
  trackShape.closePath();
  const trackCore = extrudeAlongY(
    trackShape,
    -0.08,
    0.16,
    R500_GOLD_ACCENT,
    0.01,
    18
  );

  // Upper & lower helical power/control cable take-up spools (tier 2 & 3 of HexCoil stack)
  const cableSpoolU = paintGeometry(
    new THREE.CylinderGeometry(1.06, 1.14, 0.36, 28).translate(
      0.08,
      0.42,
      -sideSign * 0.08
    ),
    R500_GOLD_ACCENT
  );
  const cableSpoolL = paintGeometry(
    new THREE.CylinderGeometry(1.14, 1.06, 0.36, 28).translate(
      0.08,
      -0.42,
      -sideSign * 0.08
    ),
    R500_GOLD_ACCENT
  );
  const hubCollar = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.46, 1.38, 22),
    R500_CHASSIS_CHAMFER
  );

  const rawCam = csgUnion([
    upperFlange,
    lowerFlange,
    trackCore,
    cableSpoolU,
    cableSpoolL,
    hubCollar,
  ]);

  // Cut axle bore & 3 CNC spoked lightening windows
  const axleBore = new THREE.CylinderGeometry(0.28, 0.28, 1.8, 18);
  const spokeCutters: THREE.BufferGeometry[] = [axleBore];
  for (let k = 0; k < 3; k++) {
    const ang = (k / 3) * Math.PI * 2 + 0.35;
    spokeCutters.push(
      new THREE.CylinderGeometry(0.24, 0.24, 1.6, 14).translate(
        Math.cos(ang) * 0.82,
        0,
        Math.sin(ang) * 0.82
      )
    );
  }
  const cutters = mergeCutters(spokeCutters, R500_INNER_DARK);
  const machinedCam = csgSubtract(rawCam, [cutters]);
  rawCam.dispose();
  cutters.dispose();

  // Stainless draw-stop peg
  const stopPeg = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 0.62, 12).translate(
      -0.88,
      0.24,
      -sideSign * 0.55
    ),
    R500_CHROME
  );

  return sanitizeR500Mesh(applyR500CamUVs(mergeParts([machinedCam, stopPeg])));
}

/** H-04: Left HexCoil 360° Helical Cam Stack (assembledPos: [25.2, 1.80, -9.65]) */
export function buildR500LeftCamGeometry(): THREE.BufferGeometry {
  return buildHexCoilCamGeometry(-1);
}

/** H-05: Right HexCoil 360° Helical Cam Stack (assembledPos: [25.2, 1.80, +9.65]) */
export function buildR500RightCamGeometry(): THREE.BufferGeometry {
  return buildHexCoilCamGeometry(1);
}

/**
 * H-06: Left & Right Titanium Cam Axles, Thrust Washers & Needle Bearings
 * assembledPos: [25.2, 1.80, 0] -> axles at Z = ±9.65 moving with flexed limb tips!
 */
export function buildR500CamAxlesGeometry(): THREE.BufferGeometry {
  const buildSingleAxle = (sideSign: -1 | 1): THREE.BufferGeometry => {
    const zPos = sideSign * 9.65;
    const shaft = paintGeometry(
      new THREE.CylinderGeometry(0.26, 0.26, 2.24, 20).translate(0, 0, zPos),
      R500_STAINLESS
    );
    const washerU = paintGeometry(
      new THREE.CylinderGeometry(0.42, 0.42, 0.08, 20).translate(
        0,
        0.68,
        zPos
      ),
      R500_CHROME
    );
    const washerL = paintGeometry(
      new THREE.CylinderGeometry(0.42, 0.42, 0.08, 20).translate(
        0,
        -0.68,
        zPos
      ),
      R500_CHROME
    );
    const eClipU = paintGeometry(
      new THREE.CylinderGeometry(0.36, 0.36, 0.07, 16).translate(
        0,
        1.1,
        zPos
      ),
      R500_CHASSIS_CHAMFER
    );
    const eClipL = paintGeometry(
      new THREE.CylinderGeometry(0.36, 0.36, 0.07, 16).translate(
        0,
        -1.1,
        zPos
      ),
      R500_CHASSIS_CHAMFER
    );
    const combined = mergeParts([shaft, washerU, washerL, eClipU, eClipL]);
    return attachRigidFlexParam(combined, -1.8, 0, -sideSign * 5.05);
  };

  return sanitizeR500Mesh(
    mergeParts([buildSingleAxle(-1), buildSingleAxle(1)])
  );
}
