import * as THREE from 'three';
import {
  clampUv01 as clamp01,
  sampleTriangleInfo as triInfo,
} from '../../../engine/geometry/uvUnwrap';
import {
  csgSubtract,
  createHelicalSpring,
  createRectangularMagSpring,
  finalizeGeometry,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';

export const M82_PARKERIZED = '#46505e';
export const M82_DARK_STEEL = '#3a4350';
export const M82_CHAMFER_STEEL = '#586476';
export const M82_INNER_DARK = '#252b35';
export const M82_BRIGHT_STEEL = '#cfd8e3';
export const M82_BOLT_STEEL = '#94a3b8';
export const M82_SPRING_STEEL = '#8896a8';
export const M82_SCOPE_ANODIZED = '#3a4350';
export const M82_TURRET_DRUM = '#4b5668';
export const M82_COATED_LENS = '#14b8a6';
export const M82_SORBOTHANE = '#242830';
export const M82_POLYMER_GRIP = '#303640';
export const M82_FOLLOWER_STEEL = '#d97706';

export { triInfo };

/**
 * Unwraps m82a1_upper_receiver onto Band A (v in [0.68, 0.98]) of m82a1_body_albedo.webp:
 *  - Left wall reads 'BARRETT FIREARMS MFG. INC. / MURFREESBORO, TN U.S.A. / MODEL 82A1 .50 CAL'
 *  - Right wall maps Parkerized steel + directional copper/brass kiss behind ejection port
 */
export function applyM82UpperUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let mode: 'stainless' | 'left' | 'right' | 'top_inner' = 'top_inner';
    if (cr > 0.42) {
      mode = 'stainless';
    } else if (fnz < -0.35 && cz < -0.48) {
      mode = 'left';
    } else if (fnz > 0.35 && cz > 0.48) {
      mode = 'right';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const yNorm = clamp01((y - 0.2) / 2.5);

      let u: number;
      let v: number;
      if (mode === 'stainless') {
        u = 0.9 + clamp01((x + 20) / 38) * 0.07;
        v = 0.05 + clamp01((y + z) * 0.2 + 0.5) * 0.25;
      } else if (mode === 'left') {
        // Left view looks toward +Z, so +X is on left of screen and -X is on right of screen
        const sLeft = clamp01((7.8 - x) / 25.5);
        u = 0.04 + sLeft * 0.49;
        v = 0.695 + yNorm * 0.275;
      } else if (mode === 'right') {
        const xNorm = clamp01((x - -20.8) / 37.3);
        u = 0.56 + xNorm * 0.41;
        v = 0.695 + yNorm * 0.275;
      } else {
        const xNorm = clamp01((x - -20.8) / 37.3);
        u = 0.56 + xNorm * 0.38;
        v = 0.72 + clamp01((z + 1.2) / 2.4) * 0.08;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps m82a1_lower_receiver onto Band B (v in [0.38, 0.66]) + Sorbothane & Stainless swatches:
 *  - Rear Sorbothane Buttpad (cx < -20.72) -> Ribbed Elastomer swatch (u in [0.78, 0.88], v in [0.03, 0.33])
 *  - Left wall -> SAFE / FIRE markings around selector pivot X = -2.95
 */
export function applyM82LowerUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cx, cz, cr, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let mode: 'buttpad' | 'stainless' | 'left' | 'right' | 'other' = 'other';
    if (cx < -20.72) {
      mode = 'buttpad';
    } else if (cr > 0.42) {
      mode = 'stainless';
    } else if (fnz < -0.35 && cz < -0.45) {
      mode = 'left';
    } else if (fnz > 0.35 && cz > 0.45) {
      mode = 'right';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (mode === 'buttpad') {
        u = 0.79 + clamp01((z + 1.25) / 2.5) * 0.08;
        v = 0.04 + clamp01((y + 4.8) / 7.2) * 0.28;
      } else if (mode === 'stainless') {
        u = 0.9 + clamp01((z + 1.4) / 2.8) * 0.07;
        v = 0.05 + clamp01((y + 2.5) / 5.0) * 0.25;
      } else if (mode === 'left') {
        const sLeft = clamp01((2.2 - x) / 24.5);
        const yNorm = clamp01((y - -1.45) / 1.7);
        u = 0.04 + sLeft * 0.48;
        v = 0.4 + yNorm * 0.24;
      } else if (mode === 'right') {
        const xNorm = clamp01((x - -20.8) / 36.6);
        const yNorm = clamp01((y - -2.4) / 2.6);
        u = 0.28 + xNorm * 0.25;
        v = 0.4 + yNorm * 0.24;
      } else {
        u = 0.3 + clamp01((x + 20.8) / 36.6) * 0.22;
        v = 0.44 + clamp01((z + 1.2) / 2.4) * 0.08;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps m82a1_scope onto Band C of m82a1_body_albedo.webp:
 *  - Emerald multi-coated lenses (cg > 0.25 && cr < 0.10) -> Coated Lens Swatch (u=0.67, v=0.18)
 *  - Top Elevation & Side Windage Turret Drums -> White '0..15 MIL' graduation band (v in [0.03, 0.155])
 *  - Matte anodized scope tube, objective bell w/ 360° Leupold Gold Ring & threaded sunshade
 */
export function applyM82ScopeUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cx, cy, cz, cr, cg, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let mode: 'lens' | 'elev_turret' | 'wind_turret' | 'bell' | 'body' = 'body';
    if (cg > 0.25 && cr < 0.1) {
      mode = 'lens';
    } else if (cy > 0.62 && Math.abs(cx - -0.3) < 0.8) {
      mode = 'elev_turret';
    } else if (Math.abs(cz) > 0.62 && Math.abs(cx - -0.3) < 0.8) {
      mode = 'wind_turret';
    } else if (cx > 3.8) {
      mode = 'bell';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (mode === 'lens') {
        u = 0.67 + clamp01((z + 1.05) / 2.1) * 0.14 - 0.07;
        v = 0.18 + clamp01((y + 1.05) / 2.1) * 0.24 - 0.12;
      } else if (mode === 'elev_turret') {
        const ang = Math.atan2(z, x - -0.3);
        const uTurn = (ang + Math.PI) / (Math.PI * 2);
        const hNorm = clamp01((y - 0.62) / 0.86);
        u = 0.035 + uTurn * 0.51;
        v = 0.03 + hNorm * 0.125;
      } else if (mode === 'wind_turret') {
        const ang = Math.atan2(y, x - -0.3);
        const uTurn = (ang + Math.PI) / (Math.PI * 2);
        const hNorm = clamp01((Math.abs(z) - 0.62) / 0.78);
        u = 0.035 + uTurn * 0.51;
        v = 0.03 + hNorm * 0.125;
      } else if (mode === 'bell') {
        // Continuous 360° mapping along X so the Leupold Gold Ring wraps cleanly around the 50mm objective bell!
        const xNorm = clamp01((x - -7.4) / 15.25);
        u = 0.04 + xNorm * 0.48;
        v = 0.18 + clamp01((y + 1.15) / 2.3) * 0.15;
      } else {
        const xNorm = clamp01((x - -7.4) / 11.4);
        if (fnz >= 0) {
          u = 0.04 + xNorm * 0.38;
        } else {
          u = 0.04 + (1.0 - xNorm) * 0.38;
        }
        v = 0.18 + clamp01((y + 0.9) / 1.8) * 0.15;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps m82a1_mag_body onto Band B Right Half (u in [0.56, 0.98], v in [0.38, 0.66])
 */
export function applyM82MagUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let mode: 'stainless' | 'right' | 'left' | 'spine' = 'spine';
    if (cr > 0.42) {
      mode = 'stainless';
    } else if (fnz > 0.35 && cz > 0.35) {
      mode = 'right';
    } else if (fnz < -0.35 && cz < -0.35) {
      mode = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x + 3.05) / 6.1);
      const yNorm = clamp01((y + 6.4) / 9.05);

      let u: number;
      let v: number;
      if (mode === 'stainless') {
        u = 0.9 + clamp01((x + 3.1) / 6.2) * 0.07;
        v = 0.05 + yNorm * 0.25;
      } else if (mode === 'right') {
        u = 0.575 + xNorm * 0.39;
        v = 0.39 + yNorm * 0.26;
      } else if (mode === 'left') {
        u = 0.575 + (1.0 - xNorm) * 0.39;
        v = 0.39 + yNorm * 0.26;
      } else {
        u = 0.57 + clamp01((z + 0.9) / 1.8) * 0.03;
        v = 0.39 + yNorm * 0.26;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// GROUP 2 ('frame'): LOWER RECEIVER, CYLINDRICAL BUFFER & SPRING, BIPOD & GRIP
// ============================================================================

/**
 * F-01: Sheet-Steel Lower Receiver w/ Integral Rifle Buttstock, Reinforced .50 BMG Magwell,
 * Front/Rear Cross-Lock Takedown Pins & Thick Sorbothane Rubber Recoil Pad
 * (assembledPos: [0, 0, 0], isShell: true)
 * Mates 100% flush with Upper Receiver along horizontal split seam Y = +0.20 across X ∈ [-20.8, +15.8]!
 */
export function buildM82LowerReceiverGeometry(): THREE.BufferGeometry {
  const lowerShape = new THREE.Shape();
  lowerShape.moveTo(-20.8, 0.2); // Top rear split line
  lowerShape.lineTo(15.8, 0.2); // Top front split line (flush w/ upper receiver bottom Y=0.20!)
  lowerShape.lineTo(15.8, -0.44); // Front nose bevel
  lowerShape.lineTo(13.6, -0.92); // Front bipod mounting yoke flat
  lowerShape.lineTo(8.85, -0.92); // Forend bottom behind yoke
  lowerShape.lineTo(8.55, -2.36); // Front of massive .50 BMG magwell
  lowerShape.lineTo(1.85, -2.36); // Rear of .50 BMG magwell
  lowerShape.lineTo(1.55, -1.25); // Step behind magwell (meets front of trigger guard)
  lowerShape.lineTo(-5.2, -1.25); // Flat FCG & pistol-grip mounting deck
  // Iconic Barrett sniper rear support-hand hook cutout & angled sheet-steel buttstock toe
  lowerShape.lineTo(-14.75, -3.55);
  lowerShape.lineTo(-15.65, -3.12); // Support-hand rear hook step
  lowerShape.lineTo(-19.0, -3.96);
  lowerShape.lineTo(-19.62, -4.65); // Buttstock heel
  lowerShape.lineTo(-20.8, -4.65);
  lowerShape.closePath();

  const rawHull = new THREE.ExtrudeGeometry(lowerShape, {
    depth: 2.24,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  rawHull.translate(0, 0, -1.12);
  paintGeometry(rawHull, M82_PARKERIZED);

  // Hollow interior channel, .50 BMG magwell through-cavity, trigger/striker slot & buttstock buffer tunnel
  const upperTrough = paintGeometry(
    new THREE.BoxGeometry(35.6, 1.35, 1.88).translate(-2.4, -0.35, 0),
    M82_INNER_DARK
  );
  const buttstockCavity = paintGeometry(
    new THREE.BoxGeometry(14.8, 2.4, 1.82)
      .rotateZ(0.14)
      .translate(-13.0, -1.45, 0),
    M82_INNER_DARK
  );
  const magwellThrough = paintGeometry(
    new THREE.BoxGeometry(6.32, 3.05, 1.84).translate(5.25, -1.1, 0),
    M82_INNER_DARK
  );
  const triggerSlot = paintGeometry(
    new THREE.BoxGeometry(2.2, 1.25, 0.84).translate(-0.55, -0.95, 0),
    M82_INNER_DARK
  );

  const shell = csgSubtract(rawHull, [
    upperTrough,
    buttstockCavity,
    magwellThrough,
    triggerSlot,
  ]);

  // Thick Ribbed Sorbothane Recoil-Absorbing Buttpad (X ∈ [-22.0, -20.8]) + steel baseplate
  const padBackingPlate = paintGeometry(
    new THREE.BoxGeometry(0.16, 7.06, 2.34).translate(-20.88, -1.17, 0),
    M82_DARK_STEEL
  );
  const padMain = paintGeometry(
    new THREE.BoxGeometry(1.06, 7.08, 2.38).translate(-21.46, -1.17, 0),
    M82_SORBOTHANE
  );
  const padCutters: THREE.BufferGeometry[] = [];
  for (let r = 0; r < 9; r++) {
    const ry = -4.15 + r * 0.74;
    padCutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.32, 0.22, 2.6).translate(-21.94, ry, 0),
        M82_SORBOTHANE
      )
    );
  }
  const sorbothanePad = csgSubtract(padMain, padCutters);

  // Internal cylindrical buffer housing tube at rear + internal accelerator abutment block
  const rearBufferTube = paintGeometry(
    new THREE.CylinderGeometry(0.76, 0.76, 4.2, 22)
      .rotateZ(Math.PI / 2)
      .translate(-18.6, 1.25, 0),
    M82_DARK_STEEL
  );
  const rearBufferHole = paintGeometry(
    new THREE.CylinderGeometry(0.62, 0.62, 4.6, 20)
      .rotateZ(Math.PI / 2)
      .translate(-18.6, 1.25, 0),
    M82_INNER_DARK
  );
  const bufferCollar = csgSubtract(rearBufferTube, [rearBufferHole]);

  const acceleratorStopBlock = paintGeometry(
    new THREE.BoxGeometry(0.72, 0.42, 1.62).translate(-5.85, 0.12, 0),
    M82_DARK_STEEL
  );

  // Stamped external magwell X/vertical reinforcement ribs on Left & Right flanks + rock-in paddle mag catch
  const subParts: THREE.BufferGeometry[] = [
    shell,
    padBackingPlate,
    sorbothanePad,
    bufferCollar,
    acceleratorStopBlock,
  ];

  for (const side of [-1, 1]) {
    const zFlank = side * 1.15;
    // Welded magwell lip flare & diagonal stamped stiffening ribs
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(6.85, 0.22, 0.08).translate(5.2, -2.24, zFlank),
        M82_DARK_STEEL
      ),
      paintGeometry(
        new THREE.BoxGeometry(4.6, 0.16, 0.06)
          .rotateZ(0.28)
          .translate(5.2, -1.22, zFlank),
        M82_PARKERIZED
      ),
      paintGeometry(
        new THREE.BoxGeometry(4.6, 0.16, 0.06)
          .rotateZ(-0.28)
          .translate(5.2, -1.22, zFlank),
        M82_PARKERIZED
      )
    );
  }

  // Rock-and-lock textured paddle magazine catch & pivot pin behind magwell
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.32, 1.12, 0.9)
        .rotateZ(0.24)
        .translate(1.68, -2.56, 0),
      M82_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.1, 0.1, 1.38, 12)
        .rotateX(Math.PI / 2)
        .translate(1.82, -2.18, 0),
      M82_BRIGHT_STEEL
    )
  );

  // Front (X=+14.6) & Rear (X=-19.8) Cross-Lock Takedown Pins w/ stop heads, keeper bosses & stainless pull rings!
  for (const px of [14.6, -19.8]) {
    subParts.push(
      // Welded pin-boss sleeve collars on flanks
      paintGeometry(
        new THREE.CylinderGeometry(0.3, 0.3, 2.42, 18)
          .rotateX(Math.PI / 2)
          .translate(px, 0.04, 0),
        M82_DARK_STEEL
      ),
      // Hardened stainless cross-lock takedown pin shaft + right detent tip + left pull-ring head
      paintGeometry(
        new THREE.CylinderGeometry(0.18, 0.18, 2.74, 18)
          .rotateX(Math.PI / 2)
          .translate(px, 0.04, 0),
        M82_BRIGHT_STEEL
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.25, 0.25, 0.14, 18)
          .rotateX(Math.PI / 2)
          .translate(px, 0.04, -1.28),
        M82_BRIGHT_STEEL
      ),
      paintGeometry(
        new THREE.TorusGeometry(0.38, 0.055, 10, 22).translate(
          px,
          -0.18,
          -1.36
        ),
        M82_BRIGHT_STEEL
      )
    );
  }

  // Front Bipod Mounting Yoke Clevis Ears (X = +14.7) + Rear buttstock monopod rail boss (X = -17.4)
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(1.78, 0.56, 0.24).translate(14.7, -0.95, -0.68),
      M82_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(1.78, 0.56, 0.24).translate(14.7, -0.95, 0.68),
      M82_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.4, 0.28, 0.86)
        .rotateZ(0.23)
        .translate(-17.35, -3.72, 0),
      M82_DARK_STEEL
    )
  );

  return applyM82LowerUVs(mergeParts(subParts));
}

/**
 * F-02: Rear Cylindrical Bolt Buffer Assembly & Main Action Recoil Spring
 * (assembledPos: [0, 1.25, 0], spans local X ∈ [-20.48, -6.60], L0 = 13.88)
 * Features:
 *  - Stepped machined cylindrical bolt buffer plunger cup w/ elastomer impact face (X ∈ [-8.42, -6.60])
 *  - Full-length heavy 28-coil main recoil spring (X ∈ [-20.28, -8.35])
 *  - Rear guide rod & buttstock buffer stop plug (X ∈ [-20.48, -17.80])
 */
export function buildM82RecoilSpringGeometry(): THREE.BufferGeometry {
  // 1) Front cylindrical bolt buffer plunger cup & elastomer strike pad (meets bolt carrier tail at X = -6.60)
  const frontImpactPad = paintGeometry(
    new THREE.CylinderGeometry(0.54, 0.56, 0.22, 24)
      .rotateZ(Math.PI / 2)
      .translate(-6.71, 0, 0),
    M82_SORBOTHANE
  );
  const bufferCylinderCup = paintGeometry(
    new THREE.CylinderGeometry(0.59, 0.59, 1.48, 26)
      .rotateZ(Math.PI / 2)
      .translate(-7.56, 0, 0),
    M82_BRIGHT_STEEL
  );
  const bufferWearBand = paintGeometry(
    new THREE.CylinderGeometry(0.605, 0.605, 0.26, 26)
      .rotateZ(Math.PI / 2)
      .translate(-7.42, 0, 0),
    M82_BOLT_STEEL
  );
  const bufferSpringShoulder = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.56, 0.24, 22)
      .rotateZ(Math.PI / 2)
      .translate(-8.38, 0, 0),
    M82_DARK_STEEL
  );

  // 2) Full-length coaxial heavy main action recoil spring
  const mainSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -20.28,
      end: -8.34,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.53,
      wireRadius: 0.082,
      coils: 28,
      radialSegments: 10,
      tubularSegmentsPerCoil: 16,
    }),
    M82_SPRING_STEEL
  );

  // 3) Rear guide stem & buttstock buffer plug flange at X = -20.48
  const rearGuideStem = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.36, 2.55, 20)
      .rotateZ(Math.PI / 2)
      .translate(-19.1, 0, 0),
    M82_BOLT_STEEL
  );
  const rearSeatFlange = paintGeometry(
    new THREE.CylinderGeometry(0.61, 0.61, 0.22, 24)
      .rotateZ(Math.PI / 2)
      .translate(-20.39, 0, 0),
    M82_DARK_STEEL
  );

  return mergeParts([
    frontImpactPad,
    bufferCylinderCup,
    bufferWearBand,
    bufferSpringShoulder,
    mainSpring,
    rearGuideStem,
    rearSeatFlange,
  ]);
}

/**
 * F-03: Folding Height-Adjustable Spiked-Foot Steel Bipod Assembly
 * (assembledPos: [14.7, -0.85, 0])
 */
export function buildM82BipodGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Central QD yoke block, cant spigot, friction thumb-nut & transverse clevis cross-bolt
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(1.62, 0.78, 1.14).translate(0, -0.18, 0),
      M82_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.19, 0.19, 1.86, 18)
        .rotateZ(Math.PI / 2)
        .translate(0.05, -0.14, 0),
      M82_BRIGHT_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.28, 0.28, 0.22, 16)
        .rotateZ(Math.PI / 2)
        .translate(-0.92, -0.14, 0),
      M82_BOLT_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.16, 0.16, 1.82, 16)
        .rotateX(Math.PI / 2)
        .translate(0, -0.08, 0),
      M82_BRIGHT_STEEL
    )
  );

  // Left (-1) & Right (+1) deployed perforated steel legs w/ telescoping notched extensions & spiked claw feet
  for (const side of [-1, 1]) {
    const legGroup: THREE.BufferGeometry[] = [];

    // Upper folding hinge knuckle & locking sector plate
    legGroup.push(
      paintGeometry(
        new THREE.BoxGeometry(0.82, 0.76, 0.64).translate(0, -0.54, 0),
        M82_PARKERIZED
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.11, 0.11, 0.74, 12)
          .rotateX(Math.PI / 2)
          .translate(0, -0.54, 0),
        M82_BRIGHT_STEEL
      )
    );

    // Perforated rectangular stamped-steel outer leg channel (5 lightening holes)
    const outerLegRaw = paintGeometry(
      new THREE.BoxGeometry(0.66, 3.95, 0.54).translate(0, -2.76, 0),
      M82_PARKERIZED
    );
    const lightenHoles: THREE.BufferGeometry[] = [];
    for (const hy of [-1.35, -2.02, -2.69, -3.36, -4.03]) {
      lightenHoles.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.15, 0.15, 0.86, 14)
            .rotateZ(Math.PI / 2)
            .translate(0, hy, 0),
          M82_INNER_DARK
        )
      );
    }
    legGroup.push(csgSubtract(outerLegRaw, lightenHoles));

    // External locking spring, latch lever & quick-release pull ring
    legGroup.push(
      paintGeometry(
        createHelicalSpring({
          axis: 'y',
          start: -2.25,
          end: -0.95,
          centerX: -0.4,
          centerZ: side * 0.24,
          coilRadius: 0.12,
          wireRadius: 0.028,
          coils: 9,
        }),
        M82_SPRING_STEEL
      ),
      paintGeometry(
        new THREE.BoxGeometry(0.24, 0.42, 0.36).translate(
          -0.28,
          -4.48,
          side * 0.22
        ),
        M82_DARK_STEEL
      ),
      paintGeometry(
        new THREE.TorusGeometry(0.22, 0.04, 8, 16).translate(
          0,
          -4.48,
          side * 0.36
        ),
        M82_BRIGHT_STEEL
      )
    );

    // Notched telescoping inner steel extension leg (5 height-adjustment detents)
    legGroup.push(
      paintGeometry(
        new THREE.BoxGeometry(0.45, 3.08, 0.39).translate(0, -5.96, 0),
        M82_BOLT_STEEL
      )
    );
    for (const ny of [-5.0, -5.5, -6.0, -6.5, -7.0]) {
      legGroup.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.265, 0.265, 0.075, 14).translate(
            0,
            ny,
            0
          ),
          M82_DARK_STEEL
        )
      );
    }

    // Iconic Barrett spiked ski/claw footpad + front upturned serrated toe + 4 ground-biting steel spikes!
    legGroup.push(
      paintGeometry(
        new THREE.BoxGeometry(1.56, 0.22, 0.92).translate(0.14, -7.48, 0),
        M82_DARK_STEEL
      ),
      paintGeometry(
        new THREE.BoxGeometry(0.36, 0.42, 0.9)
          .rotateZ(-0.48)
          .translate(0.88, -7.34, 0),
        M82_DARK_STEEL
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.09, 0.09, 1.0, 12)
          .rotateX(Math.PI / 2)
          .translate(0, -7.36, 0),
        M82_BRIGHT_STEEL
      )
    );
    for (const sx of [-0.46, -0.06, 0.34, 0.72]) {
      for (const sz of [-0.26, 0.26]) {
        legGroup.push(
          paintGeometry(
            new THREE.ConeGeometry(0.095, 0.34, 6)
              .rotateX(Math.PI)
              .translate(sx, -7.72, sz),
            M82_BRIGHT_STEEL
          )
        );
      }
    }

    const mergedLeg = mergeParts(legGroup);
    mergedLeg.rotateX(side * 0.42);
    mergedLeg.rotateZ(0.17);
    mergedLeg.translate(0, -0.15, side * 0.68);
    parts.push(mergedLeg);
  }

  return mergeParts(parts);
}

/**
 * F-04: Swept Checkered USGI A2 Pistol Grip & Enlarged Winter Trigger Guard
 * (assembledPos: [-2.4, -1.25, 0])
 */
export function buildM82PistolGripGeometry(): THREE.BufferGeometry {
  const gripShape = new THREE.Shape();
  gripShape.moveTo(-1.36, 0.04); // Rear upper tang flush against lower receiver
  gripShape.lineTo(0.68, 0.04); // Front upper lip flush against lower receiver
  gripShape.quadraticCurveTo(0.55, -0.82, 0.18, -1.45);
  gripShape.lineTo(0.35, -1.62); // Classic USGI A2 middle-finger swell ledge
  gripShape.quadraticCurveTo(-0.08, -2.56, -0.92, -4.52); // Lower front toe
  gripShape.lineTo(-2.96, -4.18); // Swept-back rear heel
  gripShape.quadraticCurveTo(-2.36, -2.55, -1.72, -1.05);
  gripShape.quadraticCurveTo(-1.45, -0.35, -1.36, 0.04);
  gripShape.closePath();

  const rawGrip = new THREE.ExtrudeGeometry(gripShape, {
    depth: 1.24,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.08,
    bevelSegments: 3,
  });
  rawGrip.translate(0, 0, -0.62);
  paintGeometry(rawGrip, M82_POLYMER_GRIP);

  // Raised checkered side grip panels + horizontal traction grooves on front/backstraps
  const panelShape = new THREE.Shape();
  panelShape.moveTo(-1.22, -0.65);
  panelShape.lineTo(0.05, -0.85);
  panelShape.lineTo(-0.82, -3.85);
  panelShape.lineTo(-2.35, -3.62);
  panelShape.closePath();

  const panelGeoL = new THREE.ExtrudeGeometry(panelShape, {
    depth: 0.065,
    bevelEnabled: false,
  });
  panelGeoL.translate(0, 0, -0.735);
  paintGeometry(panelGeoL, M82_SORBOTHANE);

  const panelGeoR = new THREE.ExtrudeGeometry(panelShape, {
    depth: 0.065,
    bevelEnabled: false,
  });
  panelGeoR.translate(0, 0, 0.67);
  paintGeometry(panelGeoR, M82_SORBOTHANE);

  const subParts: THREE.BufferGeometry[] = [rawGrip, panelGeoL, panelGeoR];

  // Subtle horizontal checkering ribs across both panels & grip screw boss underneath
  for (let r = 0; r < 7; r++) {
    const t = r / 6;
    const ry = -1.05 - t * 2.45;
    const rx = -0.62 - t * 0.88;
    for (const side of [-1, 1]) {
      subParts.push(
        paintGeometry(
          new THREE.BoxGeometry(1.18, 0.055, 0.035)
            .rotateZ(0.16)
            .translate(rx, ry, side * 0.745),
          M82_POLYMER_GRIP
        )
      );
    }
  }
  subParts.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.18, 0.18, 0.14, 14)
        .rotateZ(-0.36)
        .translate(-1.92, -4.28, 0),
      M82_BRIGHT_STEEL
    )
  );

  // Enlarged winter-gloved steel Trigger Guard + front/rear pivot roll pins
  const guardShape = new THREE.Shape();
  guardShape.moveTo(0.45, 0.02);
  guardShape.lineTo(0.85, 0.02);
  guardShape.lineTo(1.25, -1.3);
  guardShape.lineTo(3.45, -1.3);
  guardShape.lineTo(3.98, 0.02);
  guardShape.lineTo(4.22, 0.02);
  guardShape.lineTo(3.65, -1.54);
  guardShape.lineTo(1.05, -1.54);
  guardShape.closePath();

  const triggerGuard = new THREE.ExtrudeGeometry(guardShape, {
    depth: 0.68,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  triggerGuard.translate(0, 0, -0.34);
  paintGeometry(triggerGuard, M82_DARK_STEEL);
  subParts.push(
    triggerGuard,
    paintGeometry(
      new THREE.CylinderGeometry(0.065, 0.065, 0.86, 10)
        .rotateX(Math.PI / 2)
        .translate(0.68, -0.06, 0),
      M82_BRIGHT_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.065, 0.065, 0.86, 10)
        .rotateX(Math.PI / 2)
        .translate(4.06, -0.06, 0),
      M82_BRIGHT_STEEL
    )
  );

  return mergeParts(subParts);
}

// ============================================================================
// GROUP 3 ('fire_control'): LINEAR STRIKER, SEAR/TRANSFER BAR, TRIGGER & SELECTOR
// ============================================================================

/**
 * FC-01: Barrett Upright Linear Striker Lever & Dual Mainspring Assembly
 * (assembledPos: [-2.35, -0.35, 0])
 */
export function buildM82StrikerGeometry(): THREE.BufferGeometry {
  const pivotHub = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 1.18, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M82_BRIGHT_STEEL
  );

  const leverShape = new THREE.Shape();
  leverShape.moveTo(-0.24, -0.28);
  leverShape.lineTo(0.26, -0.26); // Bottom sear engagement shelf
  leverShape.lineTo(0.24, 0.54);
  leverShape.lineTo(0.08, 0.94); // Hardened top firing-pin strike nose (worldY <= +0.615 cocked, clears unlocked bolt +0.711!)
  leverShape.lineTo(-0.26, 0.88);
  leverShape.lineTo(-0.34, 0.32);
  leverShape.closePath();

  const arm = new THREE.ExtrudeGeometry(leverShape, {
    depth: 0.46,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  arm.translate(0, 0, -0.23);
  paintGeometry(arm, M82_BRIGHT_STEEL);

  const subParts: THREE.BufferGeometry[] = [pivotHub, arm];

  // Dual parallel high-rate mainsprings & guide rods housed low inside lower receiver (worldY < +0.15 throughout swing)
  for (const side of [-1, 1]) {
    const zOff = side * 0.24;
    subParts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.052, 0.052, 1.02, 10)
          .rotateZ(Math.PI / 2)
          .translate(-0.66, -0.06, zOff),
        M82_BOLT_STEEL
      ),
      paintGeometry(
        createHelicalSpring({
          axis: 'x',
          start: -1.12,
          end: -0.22,
          centerY: -0.06,
          centerZ: zOff,
          coilRadius: 0.115,
          wireRadius: 0.026,
          coils: 8,
        }),
        M82_SPRING_STEEL
      )
    );
  }

  return mergeParts(subParts);
}

/**
 * FC-02: Precision-Ground Primary Sear, Disconnector & Twin-Rail Transfer Bar Yoke
 * (assembledPos: [-1.45, -0.55, 0])
 */
export function buildM82SearGeometry(): THREE.BufferGeometry {
  // Twin-rail sheet-steel Transfer Bar yoke straddling FCG channel from trigger bow (+0.95) back to sear (-0.95)
  const transferBarL = paintGeometry(
    new THREE.BoxGeometry(2.15, 0.22, 0.12).translate(0.08, -0.04, -0.34),
    M82_BOLT_STEEL
  );
  const transferBarR = paintGeometry(
    new THREE.BoxGeometry(2.15, 0.22, 0.12).translate(0.08, -0.04, 0.34),
    M82_BOLT_STEEL
  );
  const transferFrontCross = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.22, 0.8).translate(1.04, -0.04, 0),
    M82_BOLT_STEEL
  );
  const transferRearBridge = paintGeometry(
    new THREE.BoxGeometry(0.38, 0.26, 0.8).translate(-0.84, 0.02, 0),
    M82_BOLT_STEEL
  );

  // Precision-ground primary sear hook + pivot pin + semi-auto disconnector & return spring
  const searHookRear = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.52, 0.48).translate(-0.78, 0.24, 0),
    M82_BRIGHT_STEEL
  );
  const searPivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 1.05, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.78, 0.08, 0),
    M82_BRIGHT_STEEL
  );
  const disconnectorTop = paintGeometry(
    new THREE.BoxGeometry(0.58, 0.54, 0.26)
      .rotateZ(-0.18)
      .translate(0.32, 0.32, 0),
    M82_BRIGHT_STEEL
  );
  const searSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.54,
      end: -0.08,
      centerX: -0.48,
      centerZ: 0,
      coilRadius: 0.11,
      wireRadius: 0.026,
      coils: 6,
    }),
    M82_SPRING_STEEL
  );

  return mergeParts([
    transferBarL,
    transferBarR,
    transferFrontCross,
    transferRearBridge,
    searHookRear,
    searPivotPin,
    disconnectorTop,
    searSpring,
  ]);
}

/**
 * FC-03: Grooved Curved Match Trigger & Transfer Bow
 * (assembledPos: [-0.45, -1.05, 0])
 * Pivot at local (0, 0, 0); trigger shoe hangs down (-Y) so rz < 0 pulls shoe rearward (-X)!
 */
export function buildM82TriggerGeometry(): THREE.BufferGeometry {
  const pivotAxle = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 1.18, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M82_BRIGHT_STEEL
  );

  const shoeShape = new THREE.Shape();
  shoeShape.moveTo(-0.2, 0.15);
  shoeShape.lineTo(0.24, 0.15);
  shoeShape.quadraticCurveTo(0.05, -0.68, 0.32, -1.25);
  shoeShape.lineTo(0.06, -1.36);
  shoeShape.quadraticCurveTo(-0.32, -0.72, -0.2, 0.15);
  shoeShape.closePath();

  const rawShoe = new THREE.ExtrudeGeometry(shoeShape, {
    depth: 0.44,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  rawShoe.translate(0, 0, -0.22);
  paintGeometry(rawShoe, M82_DARK_STEEL);

  // Carve longitudinal anti-slip finger traction grooves along front face of trigger shoe
  const grooveCutters: THREE.BufferGeometry[] = [];
  for (const gz of [-0.13, -0.045, 0.045, 0.13]) {
    grooveCutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.12, 1.25, 0.038)
          .rotateZ(0.2)
          .translate(0.22, -0.68, gz),
        M82_INNER_DARK
      )
    );
  }
  const groovedShoe = csgSubtract(rawShoe, grooveCutters);

  // Upper trigger bow yoke engaging the twin-rail transfer bar + overtravel stop screw
  const upperBow = paintGeometry(
    new THREE.BoxGeometry(1.02, 0.32, 0.72).translate(-0.34, 0.28, 0),
    M82_DARK_STEEL
  );
  const stopScrew = paintGeometry(
    new THREE.CylinderGeometry(0.065, 0.065, 0.3, 10)
      .rotateZ(Math.PI / 2)
      .translate(-0.82, 0.28, 0),
    M82_BRIGHT_STEEL
  );

  return mergeParts([pivotAxle, groovedShoe, upperBow, stopScrew]);
}

/**
 * FC-04: Left-Side Rotary Thumb Safety Selector Lever (SAFE / FIRE) w/ Internal Half-Moon Cam
 * (assembledPos: [-2.95, -0.48, 0])
 */
export function buildM82SelectorGeometry(): THREE.BufferGeometry {
  const rawShaft = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 2.38, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0),
    M82_DARK_STEEL
  );
  // Carve half-moon trigger-release cam notch into central cross-shaft
  const camCut = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.24, 0.72).translate(0.12, -0.14, 0),
    M82_INNER_DARK
  );
  const cammedShaft = csgSubtract(rawShaft, [camCut]);

  // Left-side grooved AR/M82A1 thumb lever at Z = -1.20 w/ pointer ridge + right-side witness cap
  const leftPlate = paintGeometry(
    new THREE.CylinderGeometry(0.37, 0.37, 0.14, 22)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -1.2),
    M82_DARK_STEEL
  );
  const thumbPaddle = paintGeometry(
    new THREE.BoxGeometry(1.2, 0.32, 0.18)
      .rotateZ(0.22)
      .translate(0.48, 0.12, -1.24),
    M82_PARKERIZED
  );
  const pointerRidge = paintGeometry(
    new THREE.BoxGeometry(0.96, 0.1, 0.07)
      .rotateZ(0.22)
      .translate(0.46, 0.12, -1.34),
    M82_BOLT_STEEL
  );
  const rightCap = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.1, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 1.2),
    M82_BRIGHT_STEEL
  );
  const witnessTick = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.06, 0.04)
      .rotateZ(0.22)
      .translate(0.04, 0.02, 1.26),
    M82_DARK_STEEL
  );

  return mergeParts([
    cammedShaft,
    leftPlate,
    thumbPaddle,
    pointerRidge,
    rightCap,
    witnessTick,
  ]);
}

// ============================================================================
// GROUP 4 ('magazine'): 10-ROUND .50 BMG RIBBED STEEL BOX MAGAZINE (4 PARTS)
// ============================================================================

/**
 * M-01: 10-Round .50 BMG Stamped Ribbed Steel Box Magazine Body
 * (assembledPos: [5.3, -2.15, 0], isShell: true)
 * Angled trapezoidal bottom slopes from (-3.05, -6.40) at rear to (+3.05, -4.90) at front (exact 0.24112 rad!).
 */
export function buildM82MagBodyGeometry(): THREE.BufferGeometry {
  const magShape = new THREE.Shape();
  magShape.moveTo(-3.05, -6.4); // Rear bottom corner
  magShape.lineTo(3.05, -4.9); // Front bottom corner (atan2(1.50, 6.10) = 0.24112 rad!)
  magShape.lineTo(3.05, 2.25); // Front upper feed shoulder
  magShape.lineTo(2.75, 2.65); // Front feed lip
  magShape.lineTo(-2.85, 2.65); // Rear feed lip
  magShape.lineTo(-3.05, 2.35); // Rear upper shoulder
  magShape.closePath();

  const rawBox = new THREE.ExtrudeGeometry(magShape, {
    depth: 1.72,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  rawBox.translate(0, 0, -0.86);
  paintGeometry(rawBox, M82_PARKERIZED);

  // Hollow internal magazine shaft + top dual-feed throat + 4 stamped vertical rib grooves & rear witness holes
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.BoxGeometry(5.68, 7.65, 1.42).translate(0, -1.35, 0),
      M82_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(5.46, 2.2, 1.18).translate(-0.05, 2.1, 0),
      M82_INNER_DARK
    ),
  ];

  // 4 vertical stamped strengthening ribs on both Left & Right steel flanks
  for (const rx of [-2.05, -0.7, 0.65, 2.0]) {
    for (const side of [-1, 1]) {
      cutters.push(
        paintGeometry(
          new THREE.CapsuleGeometry(0.135, 5.35, 4, 10).translate(
            rx,
            -1.92,
            side * 0.92
          ),
          M82_DARK_STEEL
        )
      );
    }
  }

  // Round cartridge witness holes along rear spine (5 & 10 rd indicators)
  for (const wy of [-1.4, -3.6]) {
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.14, 0.14, 0.55, 12)
          .rotateZ(Math.PI / 2)
          .translate(-2.98, wy, 0),
        M82_INNER_DARK
      )
    );
  }

  const magShell = csgSubtract(rawBox, cutters);

  // Welded front rock-in magwell hook + rear paddle-catch locking shelf + curved stainless feed lips
  const frontHook = paintGeometry(
    new THREE.BoxGeometry(0.3, 0.5, 1.4).translate(3.15, 0.45, 0),
    M82_BRIGHT_STEEL
  );
  const rearCatchLug = paintGeometry(
    new THREE.BoxGeometry(0.34, 0.44, 1.34).translate(-3.16, -0.05, 0),
    M82_BRIGHT_STEEL
  );
  const feedLipL = paintGeometry(
    new THREE.BoxGeometry(5.52, 0.24, 0.26).translate(-0.05, 2.58, -0.68),
    M82_BRIGHT_STEEL
  );
  const feedLipR = paintGeometry(
    new THREE.BoxGeometry(5.52, 0.24, 0.26).translate(-0.05, 2.58, 0.68),
    M82_BRIGHT_STEEL
  );

  const merged = mergeParts([
    magShell,
    frontHook,
    rearCatchLug,
    feedLipL,
    feedLipR,
  ]);
  return applyM82MagUVs(merged);
}

/**
 * M-02: Double-Stack .50 BMG Stepped Anti-Tilt Follower (assembledPos: [5.3, -3.55, 0])
 * Positioned cleanly beneath the 2nd (.50 BMG reserve) cartridge at worldY = -2.54!
 */
export function buildM82MagFollowerGeometry(): THREE.BufferGeometry {
  const deck = paintGeometry(
    new THREE.BoxGeometry(5.36, 0.3, 1.32)
      .rotateZ(0.08)
      .translate(0, 0.12, 0),
    M82_FOLLOWER_STEEL
  );
  const stepRidge = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 5.24, 18)
      .rotateZ(Math.PI / 2 + 0.08)
      .translate(0, 0.34, -0.26),
    M82_FOLLOWER_STEEL
  );
  const frontLeg = paintGeometry(
    new THREE.BoxGeometry(0.26, 1.15, 1.24).translate(2.46, -0.4, 0),
    M82_FOLLOWER_STEEL
  );
  const rearLeg = paintGeometry(
    new THREE.BoxGeometry(0.26, 1.35, 1.24).translate(-2.46, -0.56, 0),
    M82_FOLLOWER_STEEL
  );
  const springBoss = paintGeometry(
    new THREE.BoxGeometry(3.8, 0.22, 0.88)
      .rotateZ(0.08)
      .translate(0, -0.08, 0),
    M82_FOLLOWER_STEEL
  );
  return mergeParts([deck, stepRidge, frontLeg, rearLeg, springBoss]);
}

/**
 * M-03: Heavy-Duty Rectangular .50 BMG Magazine Coil Spring (assembledPos: [5.3, -5.65, 0])
 */
export function buildM82MagSpringGeometry(): THREE.BufferGeometry {
  const spring = createRectangularMagSpring({
    height: 3.15,
    widthX: 4.82,
    depthZ: 1.14,
    wireRadius: 0.068,
    coils: 8,
  });
  spring.rotateZ(0.241);
  paintGeometry(spring, M82_SPRING_STEEL);
  return finalizeGeometry(spring);
}

/**
 * M-04: Angled Monopod-Lip Stamped Steel Magazine Floorplate & Retainer
 * (assembledPos: [5.3, -7.8, 0], assembledRot: [0, 0, 0.24112])
 * Matches exact atan2(1.50, 6.10) = 0.24112 rad bottom slope of m82a1_mag_body with ZERO gap!
 */
export function buildM82MagFloorplateGeometry(): THREE.BufferGeometry {
  const outerPlate = paintGeometry(
    new THREE.BoxGeometry(6.46, 0.34, 1.94).translate(0.04, -0.12, 0),
    M82_DARK_STEEL
  );
  // Curled slide-on side retaining lips embracing bottom flange of mag body
  const railLipL = paintGeometry(
    new THREE.BoxGeometry(6.3, 0.24, 0.16).translate(0, 0.05, -0.88),
    M82_PARKERIZED
  );
  const railLipR = paintGeometry(
    new THREE.BoxGeometry(6.3, 0.24, 0.16).translate(0, 0.05, 0.88),
    M82_PARKERIZED
  );
  // Front tactical monopod ground-bracing lip
  const frontMonopodLip = paintGeometry(
    new THREE.BoxGeometry(0.34, 0.44, 1.92).translate(3.18, -0.16, 0),
    M82_DARK_STEEL
  );

  const extras: THREE.BufferGeometry[] = [
    outerPlate,
    railLipL,
    railLipR,
    frontMonopodLip,
  ];
  for (let i = -2; i <= 2; i++) {
    extras.push(
      paintGeometry(
        new THREE.BoxGeometry(0.28, 0.1, 1.88).translate(i * 1.12, -0.32, 0),
        M82_SORBOTHANE
      )
    );
  }
  extras.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.24, 0.24, 0.18, 16).translate(0, -0.26, 0),
      M82_BRIGHT_STEEL
    )
  );
  return mergeParts(extras);
}
