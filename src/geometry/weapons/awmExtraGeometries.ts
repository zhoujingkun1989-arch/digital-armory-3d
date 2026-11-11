import * as THREE from 'three';
import {
  createHelicalSpring,
  csgSubtract,
  csgUnion,
  mergeParts,
  paintGeometry,
} from '../springHelper';

const AWM_DARK_STEEL = '#232932';
const AWM_PARKERIZED = '#2b323d';
const AWM_INNER_DARK = '#12161c';
const AWM_STAINLESS = '#cfd8e3';
const AWM_SATIN_STEEL = '#94a3b8';
const AWM_SCOPE_BLACK = '#181c23';
const AWM_LENS_SENTINEL = '#10b981'; // Mapped to Zone D3 emerald optical coating by applyAwmScopeUVs
const AWM_GOLD_BRASS = '#d4a017';
const AWM_RED_DOT = '#dc2626';
const AWM_SPRING_STEEL = '#64748b';
const AWM_FOLLOWER_COL = '#ea580c';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
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

  const cx = (vA.x + vB.x + vC.x) / 3;
  const cy = (vA.y + vB.y + vC.y) / 3;
  const cz = (vA.z + vB.z + vC.z) / 3;
  const cr = col ? (col.getX(i0) + col.getX(i1) + col.getX(i2)) / 3 : 0.15;
  const cg = col ? (col.getY(i0) + col.getY(i1) + col.getY(i2)) / 3 : 0.15;
  return { cx, cy, cz, cr, cg, fnx: fNorm.x, fny: fNorm.y, fnz: fNorm.z };
}

/**
 * Unwraps Schmidt & Bender PM II 5-25x56 Scope onto Zone C & Zone D3 of awm_chassis_*.png:
 *  - Coated Glass Lenses (cg > 0.40 & cr < 0.20): Zone D3 (u in [0.58, 0.78], v in [0.02, 0.10])
 *  - Elevation / Windage / Parallax Turret Skirts: Zone C upper (u in [0.69, 0.97], v in [0.31, 0.47]) -> 0..14 MIL white ticks & knurling!
 *  - Main Tube & Magnification Throw Ring: Zone C lower (u in [0.69, 0.97], v in [0.15, 0.30]) -> SCHMIDT & BENDER PM II 5-25x56
 */
export function applyAwmScopeUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cx, cy, cz, cr, cg, fnx } = triInfo(pos, col, i, i + 1, i + 2);
    const isLens = cg > 0.35 && cr < 0.25;
    const isElevTurret = cx > -3.2 && cx < -0.7 && cy > 0.72;
    const isSideTurret = cx > -3.2 && cx < -0.7 && Math.abs(cz) > 0.72;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;

      if (isLens && Math.abs(fnx) > 0.4) {
        u = 0.68 + clamp01((z + 1.05) / 2.1) * 0.18 - 0.09;
        v = 0.06 + clamp01((y + 1.05) / 2.1) * 0.07 - 0.035;
      } else if (isElevTurret) {
        const ang = (Math.atan2(z, x - -2.05) + Math.PI) / (2 * Math.PI);
        const hNorm = clamp01((y - 0.72) / 0.88);
        u = 0.69 + ang * 0.28;
        v = 0.31 + hNorm * 0.16;
      } else if (isSideTurret) {
        const ang = (Math.atan2(y, x - -2.05) + Math.PI) / (2 * Math.PI);
        const hNorm = clamp01((Math.abs(z) - 0.72) / 0.82);
        u = 0.69 + ang * 0.28;
        v = 0.31 + hNorm * 0.16;
      } else {
        const xNorm = clamp01((x - -9.9) / 19.8);
        const yNorm = clamp01((y + 1.15) / 2.3);
        u = 0.69 + xNorm * 0.28;
        v = 0.15 + yNorm * 0.14;
      }

      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps M-01 5-Round .338 Lapua Magnum Steel Box Magazine onto Zone B lower (v in [0.14, 0.26])
 */
export function applyAwmMagUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    const isRight = fnz > 0.35 && cz > 0.2;
    const isLeft = fnz < -0.35 && cz < -0.2;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const xNorm = clamp01((x - -3.18) / 6.36);
      const yNorm = clamp01((y - -2.35) / 4.5);

      let u: number;
      let v: number;
      if (isRight) {
        u = 0.04 + xNorm * 0.56;
        v = 0.14 + yNorm * 0.115;
      } else if (isLeft) {
        u = 0.04 + (1.0 - xNorm) * 0.56;
        v = 0.14 + yNorm * 0.115;
      } else {
        u = 0.58 + xNorm * 0.06;
        v = 0.28 + yNorm * 0.08;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// GROUP 1 ('slide'): S&B PM II 5-25x56 OPTIC & 60-DEGREE 6-LUG TURN-BOLT GROUP
// ============================================================================

/**
 * S-01: Schmidt & Bender PM II 5-25x56 L/P Sniper Scope
 * assembledPos: [1.7, 3.42, 0] -> World X in [-8.2, +11.6], optical centerline Y = +3.42
 */
export function buildAwmScopeGeometry(): THREE.BufferGeometry {
  // Revolved outer body from rear ocular (-9.9) to front 56mm objective sunshade (+9.9)
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.58, -9.9),
    new THREE.Vector2(0.84, -9.9), // Rubberized fast-focus diopter ring
    new THREE.Vector2(0.84, -9.35),
    new THREE.Vector2(0.79, -9.3), // Ocular bell
    new THREE.Vector2(0.79, -7.25),
    new THREE.Vector2(0.83, -7.15), // Ribbed 5-25x magnification throw ring
    new THREE.Vector2(0.83, -6.05),
    new THREE.Vector2(0.62, -5.65), // Taper into 34mm main tube
    new THREE.Vector2(0.62, 2.45), // 34mm central tube (rings clamp at local X = -4.2 and +0.1)
    new THREE.Vector2(1.12, 5.65), // Smooth S&B objective bell flare
    new THREE.Vector2(1.12, 9.9), // 56mm objective bell + sunshade
    new THREE.Vector2(0.98, 9.9),
  ];
  const rawTube = new THREE.LatheGeometry(pts, 32);
  rawTube.rotateZ(-Math.PI / 2);
  paintGeometry(rawTube, AWM_SCOPE_BLACK);

  // Recess front objective & rear ocular cavities
  const frontRecess = paintGeometry(
    new THREE.CylinderGeometry(0.98, 0.98, 1.4, 28)
      .rotateZ(Math.PI / 2)
      .translate(9.35, 0, 0),
    AWM_INNER_DARK
  );
  const rearRecess = paintGeometry(
    new THREE.CylinderGeometry(0.66, 0.66, 0.9, 26)
      .rotateZ(Math.PI / 2)
      .translate(-9.6, 0, 0),
    AWM_INNER_DARK
  );
  const hollowedTube = csgSubtract(rawTube, [frontRecess, rearRecess]);

  // Multi-coated emerald-teal glass lenses (sentinel color mapped to Zone D3!)
  const frontLens = paintGeometry(
    new THREE.SphereGeometry(1.45, 26, 18)
      .scale(0.14, 0.67, 0.67)
      .translate(8.82, 0, 0),
    AWM_LENS_SENTINEL
  );
  const rearLens = paintGeometry(
    new THREE.SphereGeometry(1.0, 24, 16)
      .scale(0.14, 0.65, 0.65)
      .translate(-9.25, 0, 0),
    AWM_LENS_SENTINEL
  );

  // Central turret saddle block around local X = -2.05 (World X = -0.35, right between the two scope rings!)
  const saddle = paintGeometry(
    new THREE.BoxGeometry(1.85, 1.52, 1.52).translate(-2.05, 0, 0),
    AWM_SCOPE_BLACK
  );

  // Tall S&B PM II Double-Turn (DT) Elevation Turret (+Y)
  const elevTurretBase = paintGeometry(
    new THREE.CylinderGeometry(0.68, 0.71, 0.86, 28).translate(-2.05, 1.15, 0),
    AWM_SCOPE_BLACK
  );
  const elevTurretCap = paintGeometry(
    new THREE.CylinderGeometry(0.62, 0.68, 0.18, 28).translate(-2.05, 1.64, 0),
    AWM_GOLD_BRASS
  );

  // Right-side MTC Windage Turret (+Z)
  const windTurret = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.59, 0.76, 26)
      .rotateX(Math.PI / 2)
      .translate(-2.05, 0, 1.12),
    AWM_SCOPE_BLACK
  );

  // Left-side Parallax Focus & Reticle Illumination Turrets (-Z)
  const parallaxTurret = paintGeometry(
    new THREE.CylinderGeometry(0.6, 0.62, 0.82, 26)
      .rotateX(Math.PI / 2)
      .translate(-2.05, 0, -1.15),
    AWM_SCOPE_BLACK
  );
  const illumDial = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.44, 0.52, 22)
      .rotateX(Math.PI / 2)
      .translate(-4.85, 0.35, -0.78),
    AWM_SCOPE_BLACK
  );

  // Zoom throw lever fin on magnification ring
  const zoomFin = paintGeometry(
    new THREE.BoxGeometry(0.65, 0.26, 0.18).translate(-6.6, 0.92, -0.22),
    AWM_SCOPE_BLACK
  );

  const merged = mergeParts([
    hollowedTube,
    frontLens,
    rearLens,
    saddle,
    elevTurretBase,
    elevTurretCap,
    windTurret,
    parallaxTurret,
    illumDial,
    zoomFin,
  ]);
  return applyAwmScopeUVs(merged);
}

/**
 * S-02: AI One-Piece 34mm Tactical Scope Mount
 * assembledPos: [-0.4, 2.82, 0]
 * Clamps receiver top rail at World Y = +2.26 (local Y = -0.56) and holds 34mm scope at World Y = +3.42 (local Y = +0.60)
 */
export function buildAwmScopeMountGeometry(): THREE.BufferGeometry {
  // Monolithic Picatinny rail clamp base (local X in [-3.4, +3.4], local Y in [-0.72, -0.26] -> World Y in [+2.10, +2.56])
  const railBaseRaw = paintGeometry(
    new THREE.BoxGeometry(6.8, 0.48, 1.36).translate(0, -0.48, 0),
    AWM_DARK_STEEL
  );
  const railGroove = paintGeometry(
    new THREE.BoxGeometry(7.2, 0.24, 0.86).translate(0, -0.66, 0),
    AWM_INNER_DARK
  );
  // Central weight-reduction bridge window
  const bridgeCut = paintGeometry(
    new THREE.BoxGeometry(2.35, 0.42, 1.6).translate(0, -0.28, 0),
    AWM_INNER_DARK
  );
  const baseBar = csgSubtract(railBaseRaw, [railGroove, bridgeCut]);

  // Two heavy 34mm scope rings at local X = -2.25 (World X = -2.65) and local X = +2.15 (World X = +1.75)
  // Notice S&B turret saddle sits cleanly between them at World X = -0.35!
  const ringPositions = [-2.25, 2.15];
  const ringParts: THREE.BufferGeometry[] = [baseBar];

  for (const rx of ringPositions) {
    const outerRing = paintGeometry(
      new THREE.CylinderGeometry(0.88, 0.88, 1.12, 28)
        .rotateZ(Math.PI / 2)
        .translate(rx, 0.6, 0),
      AWM_DARK_STEEL
    );
    const stanchion = paintGeometry(
      new THREE.BoxGeometry(1.12, 0.88, 1.32).translate(rx, -0.02, 0),
      AWM_DARK_STEEL
    );
    const flangeL = paintGeometry(
      new THREE.BoxGeometry(1.08, 0.24, 0.34).translate(rx, 0.6, -0.92),
      AWM_DARK_STEEL
    );
    const flangeR = paintGeometry(
      new THREE.BoxGeometry(1.08, 0.24, 0.34).translate(rx, 0.6, 0.92),
      AWM_DARK_STEEL
    );
    const bore = paintGeometry(
      new THREE.CylinderGeometry(0.625, 0.625, 1.4, 28)
        .rotateZ(Math.PI / 2)
        .translate(rx, 0.6, 0),
      AWM_INNER_DARK
    );
    const splitSlot = paintGeometry(
      new THREE.BoxGeometry(1.3, 0.05, 2.3).translate(rx, 0.6, 0),
      AWM_INNER_DARK
    );
    ringParts.push(
      csgSubtract(
        csgUnion([outerRing, stanchion, flangeL, flangeR]),
        [bore, splitSlot]
      )
    );

    // 4 stainless cap screws per ring
    for (const dx of [-0.32, 0.32]) {
      for (const side of [-1, 1]) {
        ringParts.push(
          paintGeometry(
            new THREE.CylinderGeometry(0.08, 0.08, 0.36, 12).translate(
              rx + dx,
              0.68,
              side * 0.92
            ),
            AWM_STAINLESS
          )
        );
      }
    }
  }

  // 3 heavy tactical hex cross-bolt nuts on right side of rail mount
  for (const bx of [-2.5, 0.0, 2.4]) {
    ringParts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.18, 0.18, 1.62, 6)
          .rotateX(Math.PI / 2)
          .translate(bx, -0.46, 0.08),
        AWM_SATIN_STEEL
      )
    );
  }

  return mergeParts(ringParts);
}

/**
 * S-03: Manual 60-Degree 6-Lug Turn-Bolt Body + Bent Spherical Bolt Handle
 * assembledPos: [0, 1.05, 0] (Coaxial with barrel & striker so rx rotation orbits cleanly!)
 * Long-action Magnum bolt: Local X in [-4.95, +2.92], recessed bolt face at X = +2.83
 */
export function buildAwmBoltBodyGeometry(): THREE.BufferGeometry {
  // Cylindrical stainless Magnum bolt body (R = 0.45, spans [-4.45, +2.92])
  const mainCyl = paintGeometry(
    new THREE.CylinderGeometry(0.45, 0.45, 7.36, 28)
      .rotateZ(Math.PI / 2)
      .translate(-0.76, 0, 0),
    AWM_STAINLESS
  );

  // 6 Arctic anti-icing longitudinal flutes along bolt shaft [-3.5, +1.65]
  const cutters: THREE.BufferGeometry[] = [
    // Hollow internal firing-pin channel
    paintGeometry(
      new THREE.CylinderGeometry(0.28, 0.28, 7.5, 18)
        .rotateZ(Math.PI / 2)
        .translate(-0.95, 0, 0),
      AWM_INNER_DARK
    ),
    // Recessed .338 Lapua Magnum bolt face cup at X = +2.83
    paintGeometry(
      new THREE.CylinderGeometry(0.38, 0.38, 0.24, 22)
        .rotateZ(Math.PI / 2)
        .translate(2.84, 0, 0),
      AWM_INNER_DARK
    ),
    // Extractor slot on upper-right lug
    paintGeometry(
      new THREE.BoxGeometry(2.45, 0.16, 0.22).translate(1.82, 0.12, 0.44),
      AWM_INNER_DARK
    ),
  ];

  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3 + Math.PI / 6;
    const fy = Math.cos(ang) * 0.47;
    const fz = Math.sin(ang) * 0.47;
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.11, 0.11, 4.85, 12)
          .rotateZ(Math.PI / 2)
          .translate(-0.88, fy, fz),
        AWM_SATIN_STEEL
      )
    );
  }

  const flutedBody = csgSubtract(mainCyl, cutters);

  // Front 6-lug locking head: TWO tandem rows of 3 lugs (3 x 120 deg x 2 rows = 6 locking lugs -> 60 deg bolt throw!)
  const lugs: THREE.BufferGeometry[] = [];
  const rowXs = [2.62, 2.08];
  for (let rIdx = 0; rIdx < rowXs.length; rIdx++) {
    const lx = rowXs[rIdx];
    const phase = rIdx * (Math.PI / 9);
    for (let k = 0; k < 3; k++) {
      const ang = (k * 2 * Math.PI) / 3 + phase;
      const lug = paintGeometry(
        new THREE.BoxGeometry(0.42, 0.26, 0.34)
          .translate(0, 0.48, 0)
          .rotateX(ang)
          .translate(lx, 0, 0),
        AWM_STAINLESS
      );
      lugs.push(lug);
    }
  }

  // Plunger ejector pin on recessed bolt face
  const plungerPin = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 0.22, 10)
      .rotateZ(Math.PI / 2)
      .translate(2.78, -0.16, -0.16),
    AWM_GOLD_BRASS
  );

  // Rear bolt handle collar & iconic AI dog-leg swept-back bolt handle + oversized spherical knob!
  const rearCollar = paintGeometry(
    new THREE.CylinderGeometry(0.53, 0.53, 0.68, 26)
      .rotateZ(Math.PI / 2)
      .translate(-4.18, 0, 0),
    AWM_DARK_STEEL
  );

  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4.18, -0.05, 0.46),
    new THREE.Vector3(-4.42, -0.22, 1.05),
    new THREE.Vector3(-4.72, -0.55, 1.54),
    new THREE.Vector3(-4.88, -0.85, 1.85),
  ]);
  const handleStem = paintGeometry(
    new THREE.TubeGeometry(handleCurve, 18, 0.145, 14, false),
    AWM_DARK_STEEL
  );
  const boltSphereKnob = paintGeometry(
    new THREE.SphereGeometry(0.44, 24, 20).translate(-4.88, -0.85, 1.85),
    AWM_SCOPE_BLACK
  );

  return mergeParts([
    flutedBody,
    ...lugs,
    plungerPin,
    rearCollar,
    handleStem,
    boltSphereKnob,
  ]);
}

/**
 * S-04: AI Boxy Bolt Shroud w/ 3-Position Flag Safety Lever
 * assembledPos: [-4.85, 1.05, 0] -> World X in [-6.22, -4.15]
 */
export function buildAwmBoltShroudGeometry(): THREE.BufferGeometry {
  const shroudBox = paintGeometry(
    new THREE.BoxGeometry(1.92, 0.96, 0.92).translate(-0.35, 0.04, 0),
    AWM_DARK_STEEL
  );
  const frontPlug = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.46, 0.48, 22)
      .rotateZ(Math.PI / 2)
      .translate(0.52, 0, 0),
    AWM_PARKERIZED
  );
  const boreHole = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 2.6, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.2, 0, 0),
    AWM_INNER_DARK
  );
  // Top chamfer bevels for authentic hexagonal AI shroud profile
  const bevelL = paintGeometry(
    new THREE.BoxGeometry(2.1, 0.45, 0.45)
      .rotateX(Math.PI / 4)
      .translate(-0.35, 0.52, -0.48),
    AWM_DARK_STEEL
  );
  const bevelR = paintGeometry(
    new THREE.BoxGeometry(2.1, 0.45, 0.45)
      .rotateX(Math.PI / 4)
      .translate(-0.35, 0.52, 0.48),
    AWM_DARK_STEEL
  );
  const body = csgSubtract(csgUnion([shroudBox, frontPlug]), [
    boreHole,
    bevelL,
    bevelR,
  ]);

  // Iconic AI 3-Position Flag Safety Lever on left-rear of shroud + red fire-ready indicator dot
  const safetyPivot = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 0.32, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.78, 0.22, -0.44),
    AWM_SATIN_STEEL
  );
  const safetyFlag = paintGeometry(
    new THREE.BoxGeometry(0.76, 0.34, 0.18).translate(-0.88, 0.38, -0.55),
    AWM_DARK_STEEL
  );
  const redFireDot = paintGeometry(
    new THREE.SphereGeometry(0.075, 12, 10).translate(-0.38, 0.36, -0.47),
    AWM_RED_DOT
  );

  return mergeParts([body, safetyPivot, safetyFlag, redFireDot]);
}

/**
 * S-05: Internal Striker / Firing Pin Assembly w/ Cocking Piece Sear Lug & Tactile Indicator
 * assembledPos: [-1.45, 1.05, 0] -> World X in [-6.38, +2.50]
 */
export function buildAwmStrikerGeometry(): THREE.BufferGeometry {
  // Forward tapered needle tip (local X in [+2.4, +3.95] -> World X up to +2.50; protrudes to +3.02 on strike!)
  const needleTip = paintGeometry(
    new THREE.CylinderGeometry(0.045, 0.11, 1.55, 16)
      .rotateZ(-Math.PI / 2)
      .translate(3.18, 0, 0),
    AWM_STAINLESS
  );
  // Central shaft inside firing-pin spring
  const mainRod = paintGeometry(
    new THREE.CylinderGeometry(0.125, 0.125, 6.2, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.65, 0, 0),
    AWM_STAINLESS
  );
  // Front spring abutment collar flange
  const springCollar = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 0.2, 20)
      .rotateZ(Math.PI / 2)
      .translate(2.32, 0, 0),
    AWM_SATIN_STEEL
  );
  // Bottom cocking-piece sear lug (local X = -2.05 -> World X = -3.20, engaging awm_sear at World X = -3.27!)
  const searLug = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.56, 0.24).translate(-2.05, -0.36, 0),
    AWM_DARK_STEEL
  );
  // Rear tactile cocking indicator tail protruding behind bolt shroud
  const cockIndicator = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 1.25, 16)
      .rotateZ(Math.PI / 2)
      .translate(-4.3, 0, 0),
    AWM_STAINLESS
  );

  return mergeParts([
    needleTip,
    mainRod,
    springCollar,
    searLug,
    cockIndicator,
  ]);
}

/**
 * S-06: Helical Firing Pin Spring
 * assembledPos: [-1.65, 1.05, 0] -> Local X in [-2.15, +2.15] (L0 = 4.30)
 */
export function buildAwmFiringPinSpringGeometry(): THREE.BufferGeometry {
  const spring = createHelicalSpring({
    axis: 'x',
    start: -2.15,
    end: 2.15,
    centerY: 0,
    centerZ: 0,
    coilRadius: 0.24,
    wireRadius: 0.046,
    coils: 16,
  });
  return paintGeometry(spring, AWM_SPRING_STEEL);
}

/**
 * S-07: External Spring-Steel Claw Extractor (Coaxial at [0, 1.05, 0] with bolt body!)
 */
export function buildAwmExtractorGeometry(): THREE.BufferGeometry {
  const springLeaf = paintGeometry(
    new THREE.BoxGeometry(2.15, 0.13, 0.14).translate(1.68, 0.12, 0.44),
    AWM_PARKERIZED
  );
  const clawHook = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.18, 0.22).translate(2.85, 0.12, 0.39),
    AWM_STAINLESS
  );
  const retainCollar = paintGeometry(
    new THREE.BoxGeometry(0.26, 0.22, 0.18).translate(0.68, 0.12, 0.42),
    AWM_DARK_STEEL
  );
  return mergeParts([springLeaf, clawHook, retainCollar]);
}

// ============================================================================
// GROUP 3 ('fire_control'): TWO-STAGE MATCH TRIGGER PACK & MAG CATCH
// ============================================================================

/**
 * FC-01: Two-Stage Match Trigger Box Cassette Housing
 * assembledPos: [-2.45, -0.65, 0] -> World Y in [-1.32, +0.26] (mates flush with receiver bottom +0.22!)
 */
export function buildAwmTriggerBoxGeometry(): THREE.BufferGeometry {
  const boxRaw = paintGeometry(
    new THREE.BoxGeometry(2.15, 1.38, 0.68).translate(0, 0.02, 0),
    AWM_DARK_STEEL
  );
  const topTang = paintGeometry(
    new THREE.BoxGeometry(2.45, 0.22, 0.82).translate(0.05, 0.8, 0),
    AWM_PARKERIZED
  );
  const innerSlot = paintGeometry(
    new THREE.BoxGeometry(1.72, 1.15, 0.36).translate(0.04, -0.05, 0),
    AWM_INNER_DARK
  );
  const sideWindow = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 0.85, 16)
      .rotateX(Math.PI / 2)
      .translate(-0.28, 0.08, 0),
    AWM_INNER_DARK
  );
  const housing = csgSubtract(csgUnion([boxRaw, topTang]), [
    innerSlot,
    sideWindow,
  ]);

  // Brass/steel 1st & 2nd stage pull-weight adjustment screws + cross pins
  const adjScrew1 = paintGeometry(
    new THREE.CylinderGeometry(0.07, 0.07, 0.38, 12).translate(0.68, -0.62, 0),
    AWM_GOLD_BRASS
  );
  const adjScrew2 = paintGeometry(
    new THREE.CylinderGeometry(0.07, 0.07, 0.38, 12).translate(-0.62, -0.62, 0),
    AWM_GOLD_BRASS
  );
  const pins: THREE.BufferGeometry[] = [];
  for (const [px, py] of [
    [-0.45, 0.42],
    [0.25, 0.36],
    [0.2, -0.45],
  ]) {
    pins.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.065, 0.065, 0.74, 12)
          .rotateX(Math.PI / 2)
          .translate(px, py, 0),
        AWM_STAINLESS
      )
    );
  }

  return mergeParts([housing, adjScrew1, adjScrew2, ...pins]);
}

/**
 * FC-02: Hardened Tool-Steel Top Sear & Transfer Lever
 * assembledPos: [-2.55, 0.18, 0] -> Top sear nose at World Y = +0.56 engages striker lug!
 */
export function buildAwmSearGeometry(): THREE.BufferGeometry {
  const mainBar = paintGeometry(
    new THREE.BoxGeometry(1.48, 0.28, 0.28).translate(0, 0.02, 0),
    AWM_STAINLESS
  );
  const searTooth = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.36, 0.28).translate(-0.12, 0.24, 0),
    AWM_STAINLESS
  );
  const transferLeg = paintGeometry(
    new THREE.BoxGeometry(0.26, 0.56, 0.24).translate(0.45, -0.26, 0),
    AWM_SATIN_STEEL
  );
  const coilSpring = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.34, 12).translate(-0.52, -0.22, 0),
    AWM_GOLD_BRASS
  );
  return mergeParts([mainBar, searTooth, transferLeg, coilSpring]);
}

/**
 * FC-03: Curved Two-Stage Match Sniper Trigger Shoe
 * assembledPos: [-2.25, -1.25, 0] (Pivot at [0,0,0]; rz < 0 pulls trigger blade rearward -X!)
 */
export function buildAwmTriggerShoeGeometry(): THREE.BufferGeometry {
  const upperYoke = paintGeometry(
    new THREE.BoxGeometry(0.52, 0.36, 0.26).translate(-0.04, 0.08, 0),
    AWM_DARK_STEEL
  );
  const clampPost = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.34, 0.24).translate(0.02, -0.2, 0),
    AWM_SATIN_STEEL
  );
  const bladeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.06, -0.28, 0),
    new THREE.Vector3(0.18, -0.56, 0),
    new THREE.Vector3(0.12, -0.86, 0),
    new THREE.Vector3(-0.08, -1.08, 0),
  ]);
  const shoeBlade = paintGeometry(
    new THREE.TubeGeometry(bladeCurve, 16, 0.11, 12, false).scale(0.85, 1, 1.55),
    AWM_DARK_STEEL
  );
  return mergeParts([upperYoke, clampPost, shoeBlade]);
}

/**
 * FC-04: Extended Arctic-Glove Paddle Magazine Catch
 * assembledPos: [-0.82, -1.95, 0]
 */
export function buildAwmMagCatchGeometry(): THREE.BufferGeometry {
  const upperHook = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.62, 0.46).translate(0.08, 0.24, 0),
    AWM_DARK_STEEL
  );
  const paddleLever = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.68, 0.62)
      .rotateZ(-0.22)
      .translate(-0.06, -0.32, 0),
    AWM_PARKERIZED
  );
  const pivotPin = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.92, 12)
      .rotateX(Math.PI / 2)
      .translate(0, 0.05, 0),
    AWM_STAINLESS
  );
  return mergeParts([upperHook, paddleLever, pivotPin]);
}

// ============================================================================
// GROUP 4 ('magazine'): 5-ROUND .338 LAPUA MAGNUM STEEL BOX MAGAZINE
// ============================================================================

/**
 * M-01: Detachable 5-Round .338 Lapua Magnum Steel Box Magazine Body (isShell: true)
 * assembledPos: [1.35, -1.85, 0] -> Long-action Magnum box: Local X in [-3.16, +3.16] (World X in [-1.81, +4.51])
 * Internal tower Local Y in [0.0, +2.12] (World Y in [-1.85, +0.27]); Exposed lower body Local Y in [-2.35, 0.0] (World Y in [-4.20, -1.85])
 */
export function buildAwmMagBodyGeometry(): THREE.BufferGeometry {
  const outerBox = paintGeometry(
    new THREE.BoxGeometry(6.32, 4.42, 1.26).translate(0, -0.14, 0),
    AWM_DARK_STEEL
  );
  const innerCavity = paintGeometry(
    new THREE.BoxGeometry(6.02, 4.35, 1.04).translate(0, -0.05, 0),
    AWM_INNER_DARK
  );
  // Top single-feed opening between precision steel feed lips
  const topFeedSlot = paintGeometry(
    new THREE.BoxGeometry(5.96, 0.45, 0.68).translate(0.06, 2.08, 0),
    AWM_INNER_DARK
  );
  // Front bullet-tip clearance notch on feed lip wall
  const frontRampNotch = paintGeometry(
    new THREE.BoxGeometry(0.65, 0.42, 0.9).translate(2.92, 1.98, 0),
    AWM_INNER_DARK
  );

  const shell = csgSubtract(outerBox, [
    innerCavity,
    topFeedSlot,
    frontRampNotch,
  ]);

  // Pressed vertical strengthening ribs on exposed lower flanks + rear/front locking lugs
  const extras: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.BoxGeometry(0.24, 0.34, 0.68).translate(-3.2, -0.02, 0),
      AWM_STAINLESS
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.22, 0.28, 0.68).translate(3.2, 0.12, 0),
      AWM_STAINLESS
    ),
  ];
  for (const rx of [-2.15, -1.08, 0.0, 1.08, 2.15]) {
    for (const side of [-1, 1]) {
      extras.push(
        paintGeometry(
          new THREE.BoxGeometry(0.22, 2.05, 0.08).translate(
            rx,
            -1.18,
            side * 0.64
          ),
          AWM_PARKERIZED
        )
      );
    }
  }

  const merged = mergeParts([shell, ...extras]);
  return applyAwmMagUVs(merged);
}

/**
 * M-02: Anti-Tilt .338 Lapua Magnum Magazine Follower
 * assembledPos: [1.35, -2.35, 0]
 */
export function buildAwmMagFollowerGeometry(): THREE.BufferGeometry {
  const plate = paintGeometry(
    new THREE.BoxGeometry(5.84, 0.24, 0.96).translate(0, 0.06, 0),
    AWM_FOLLOWER_COL
  );
  const guideSkirtF = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.56, 0.92).translate(2.78, -0.18, 0),
    AWM_FOLLOWER_COL
  );
  const guideSkirtR = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.56, 0.92).translate(-2.78, -0.18, 0),
    AWM_FOLLOWER_COL
  );
  const cartridgeRidge = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 5.76, 16)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.18, 0.16),
    AWM_FOLLOWER_COL
  );
  return mergeParts([plate, guideSkirtF, guideSkirtR, cartridgeRidge]);
}

/**
 * M-03: High-Tension Oval Helical .338 LM Magazine Spring
 * assembledPos: [1.35, -3.28, 0] -> Spans Local Y in [-0.88, +0.88] -> World Y in [-4.16, -2.40] (flush!)
 */
export function buildAwmMagSpringGeometry(): THREE.BufferGeometry {
  const rawSpring = createHelicalSpring({
    axis: 'y',
    start: -0.88,
    end: 0.88,
    centerX: 0,
    centerZ: 0,
    coilRadius: 0.42,
    wireRadius: 0.052,
    coils: 6.5,
  });
  rawSpring.scale(5.4, 1.0, 0.95);
  return paintGeometry(rawSpring, AWM_SPRING_STEEL);
}

/**
 * M-04: Flared-Lip Flush Steel Magazine Floorplate
 * assembledPos: [1.35, -4.20, 0] -> Local Y in [-0.22, +0.08] overlaps mag_body (-4.20) with ZERO GAP!
 */
export function buildAwmMagFloorplateGeometry(): THREE.BufferGeometry {
  const basePlate = paintGeometry(
    new THREE.BoxGeometry(6.68, 0.2, 1.4).translate(0, -0.1, 0),
    AWM_DARK_STEEL
  );
  const slideRails = paintGeometry(
    new THREE.BoxGeometry(6.36, 0.14, 1.3).translate(0, 0.02, 0),
    AWM_PARKERIZED
  );
  const lockButton = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.12, 16).translate(0, -0.18, 0),
    AWM_STAINLESS
  );
  return mergeParts([basePlate, slideRails, lockButton]);
}
