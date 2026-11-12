import * as THREE from 'three';
import {
  clampUv01 as clamp01,
  fractPos,
  sampleTriangleInfo as m4TriInfo,
} from '../../../engine/geometry/uvUnwrap';
import {
  createHelicalSpring,
  csgSubtract,
  csgUnion,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';

export const M4_ANODIZED_CHARCOAL = '#3f4856';
export const M4_RAIL_BEVEL = '#566376';
export const M4_ANODIZED_DARK = '#262c36';
export const M4_PARKERIZED_STEEL = '#485262';
export const M4_BRIGHT_STEEL = '#cbd5e1';
export const M4_STAINLESS = '#e2e8f0';
export const M4_ALU_HEATSHIELD = '#d1d9e4';
export const M4_POLYMER = '#323741';
export const M4_POLYMER_ACCENT = '#282c35';
export const M4_RUBBER = '#23272f';
export const M4_BUFFER_GOLD = '#b5945b';
export const M4_BUMPER_TAN = '#a16207';
export const M4_SPRING_STEEL = '#94a3b8';
export const M4_STANAG_GREY = '#626b78';
export const M4_FOLLOWER_TAN = '#ea580c';

export { m4TriInfo };

/**
 * Guarantees strictly unit-length vertex normals, finite attributes, and up-to-date bounds
 * even across microscopic CSG seam triangles, without altering custom UV coordinates.
 */
export function sanitizeM4Geometry(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const norm = geo.attributes.normal;
  if (norm) {
    const arr = norm.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const nx = arr[i];
      const ny = arr[i + 1];
      const nz = arr[i + 2];
      const lenSq = nx * nx + ny * ny + nz * nz;
      if (Number.isFinite(lenSq) && lenSq > 1e-12) {
        const inv = 1 / Math.sqrt(lenSq);
        arr[i] = nx * inv;
        arr[i + 1] = ny * inv;
        arr[i + 2] = nz * inv;
      } else {
        arr[i] = 0;
        arr[i + 1] = 1;
        arr[i + 2] = 0;
      }
    }
    norm.needsUpdate = true;
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds a MIL-STD-1913 beveled dovetail Picatinny rail lug or spine along X.
 */
export function createM1913RailProfile(
  lengthX: number,
  topWidthZ = 0.96,
  neckWidthZ = 0.74,
  heightY = 0.15
): THREE.BufferGeometry {
  const halfTop = topWidthZ * 0.5;
  const halfMid = topWidthZ * 0.5 + 0.03;
  const halfNeck = neckWidthZ * 0.5;
  const s = new THREE.Shape();
  s.moveTo(-halfNeck, 0);
  s.lineTo(-halfMid, heightY * 0.52);
  s.lineTo(-halfTop, heightY);
  s.lineTo(halfTop, heightY);
  s.lineTo(halfMid, heightY * 0.52);
  s.lineTo(halfNeck, 0);
  s.closePath();

  const ext = new THREE.ExtrudeGeometry(s, {
    depth: lengthX,
    bevelEnabled: false,
  });
  ext.rotateY(Math.PI / 2);
  ext.translate(-lengthX * 0.5, 0, 0);
  return ext;
}

/**
 * Unwraps U-01 Forged Flat-Top M4A1 Upper Receiver onto m4a1_receiver_{albedo,normal,roughness}.webp:
 *  - Top Picatinny rail deck -> v in [0.962, 0.994] (displays white T2..T12 slot markings)
 *  - Side & arch walls -> clean flat MIL-A-8625 Type-III charcoal anodized aluminum swatch
 *  - Bright steel barrel-nut teeth / interior lugs -> bottom-right bright steel swatch
 */
export function applyM4a1UpperReceiverUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cy, cr, fny } = m4TriInfo(pos, col, i, i + 1, i + 2);
    let mode: 'bright_steel' | 'rail_top' | 'anodized' = 'anodized';
    if (cr > 0.42) {
      mode = 'bright_steel';
    } else if (fny > 0.65 && cy > 1.88) {
      mode = 'rail_top';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (mode === 'bright_steel') {
        u = 0.8 + fractPos((x + z) * 0.22) * 0.18;
        v = 0.01 + fractPos(y * 0.25) * 0.045;
      } else if (mode === 'rail_top') {
        u = 0.15 + clamp01((x + 5.45) / 9.8) * 0.72;
        v = 0.962 + clamp01((z + 0.52) / 1.04) * 0.03;
      } else {
        u = 0.42 + clamp01((x + 5.65) / 11.15) * 0.2;
        v = 0.1 + clamp01((y - 0.26) / 1.88) * 0.16;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return sanitizeM4Geometry(geo);
}

/**
 * Unwraps F-01 Forged 7075-T6 M4A1 Lower Receiver onto 2048x1024 m4a1_receiver_{albedo,normal,roughness}.webp:
 *  - Left wall (v in [0.08, 0.50]): Colt Emblem + PROPERTY OF U.S. GOVT. / M4A1 CARBINE / CAL. 5.56MM & SAFE/SEMI/AUTO
 *  - Right wall (v in [0.54, 0.96]): SAFE/SEMI/AUTO & U.S. DoD IUID CAGE 13629 DataMatrix plate
 *  - Bright steel pins / bolt catch -> bottom-right steel swatch
 */
export function applyM4a1LowerReceiverUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, fnz } = m4TriInfo(pos, col, i, i + 1, i + 2);
    let mode: 'bright_steel' | 'right' | 'left' | 'anodized' = 'anodized';
    if (cr > 0.42) {
      mode = 'bright_steel';
    } else if (fnz > 0.38 && cz > 0.34) {
      mode = 'right';
    } else if (fnz < -0.38 && cz < -0.34) {
      mode = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      const xNorm = clamp01((x + 5.8) / 10.15);
      const yNorm = clamp01((y + 2.22) / 2.5);

      let u: number;
      let v: number;
      if (mode === 'bright_steel') {
        u = 0.8 + fractPos((x + z) * 0.22) * 0.18;
        v = 0.01 + fractPos(y * 0.25) * 0.045;
      } else if (mode === 'right') {
        u = 0.02 + xNorm * 0.96;
        v = 0.54 + yNorm * 0.42;
      } else if (mode === 'left') {
        u = 0.02 + (1.0 - xNorm) * 0.96;
        v = 0.08 + yNorm * 0.42;
      } else {
        u = 0.42 + xNorm * 0.18;
        v = 0.1 + clamp01((z + 0.85) / 1.7) * 0.14;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return sanitizeM4Geometry(geo);
}

/**
 * Unwraps M-01 30-Round Curved STANAG Aluminum Magazine seamlessly across straight magwell tower & curved lower hull.
 */
export function applyM4a1MagUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  const ARC_CX = 18.0;
  const ARC_CY = -1.25;

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, fnz } = m4TriInfo(pos, col, i, i + 1, i + 2);
    let side: 'right' | 'left' | 'spine' = 'spine';
    if (fnz > 0.35 && cz > 0.18) side = 'right';
    else if (fnz < -0.35 && cz < -0.18) side = 'left';

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let rNorm: number;
      let vCoord: number;

      if (y >= ARC_CY) {
        rNorm = clamp01((1.36 - x) / 2.72);
        vCoord = 0.73 + clamp01((y - ARC_CY) / 2.32) * 0.23;
      } else {
        const dx = x - ARC_CX;
        const dy = y - ARC_CY;
        const rad = Math.sqrt(dx * dx + dy * dy);
        const ang = Math.atan2(-dy, -dx);
        rNorm = clamp01((rad - 16.64) / 2.72);
        vCoord = 0.73 - clamp01(ang / 0.36) * 0.69;
      }

      let u: number;
      if (side === 'right') {
        u = 0.08 + (1.0 - rNorm) * 0.84;
      } else if (side === 'left') {
        u = 0.08 + rNorm * 0.84;
      } else {
        u = 0.02 + clamp01((z + 0.56) / 1.12) * 0.05;
      }

      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(vCoord);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return sanitizeM4Geometry(geo);
}

// ============================================================================
// GROUP 1 ('slide'): UPPER RECEIVER, CARRY HANDLE, BCG & KAC RAS QUAD RAILS (10)
// ============================================================================

/**
 * U-01: Forged 7075-T6 Flat-Top M4A1 Upper Receiver w/ M1913 T-Slot Deck, Cam-Pin Dome,
 * Pyramidal Brass Deflector, Forward Assist w/ Pawl & Sloped Delta Ring Assembly
 * (assembledPos: [0, 0, 0] — bottom split deck at Y = 0.28 meets lower receiver flush!)
 */
export function buildM4a1UpperReceiverGeometry(): THREE.BufferGeometry {
  const sec = new THREE.Shape();
  sec.moveTo(-0.76, 0.28);
  sec.lineTo(-0.76, 1.08);
  sec.quadraticCurveTo(-0.76, 1.82, -0.44, 1.88);
  sec.lineTo(0.44, 1.88);
  sec.quadraticCurveTo(0.76, 1.82, 0.76, 1.08);
  sec.lineTo(0.76, 0.28);
  sec.closePath();

  const rawUpper = new THREE.ExtrudeGeometry(sec, {
    depth: 10.0,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  rawUpper.rotateY(Math.PI / 2);
  rawUpper.translate(-5.6, 0, 0);
  paintGeometry(rawUpper, M4_ANODIZED_CHARCOAL);

  // Cylindrical BCG raceway (Y = 1.05), top charging-handle/gas-key tunnel, M4 dual feed-ramp cuts & right ejection port
  const bcgBore = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.58, 10.5, 26)
      .rotateZ(Math.PI / 2)
      .translate(-0.55, 1.05, 0),
    M4_ANODIZED_DARK
  );
  const chSlot = paintGeometry(
    new THREE.BoxGeometry(10.4, 0.36, 0.44).translate(-0.55, 1.62, 0),
    M4_ANODIZED_DARK
  );
  const chLatchNotch = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.24, 0.42).translate(-5.52, 1.64, -0.58),
    M4_ANODIZED_DARK
  );
  const bottomOpen = paintGeometry(
    new THREE.BoxGeometry(8.85, 0.68, 1.06).translate(-0.55, 0.5, 0),
    M4_ANODIZED_DARK
  );
  const ejectionPort = paintGeometry(
    new THREE.BoxGeometry(3.06, 0.82, 0.72).translate(1.72, 1.04, 0.58),
    M4_ANODIZED_DARK
  );
  // M4 extended dual feed-ramp relief cuts machined into front lower receiver seat
  const feedRampL = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.17, 0.75, 12)
      .rotateZ(Math.PI / 2 - 0.35)
      .translate(3.72, 0.56, -0.15),
    M4_BRIGHT_STEEL
  );
  const feedRampR = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.17, 0.75, 12)
      .rotateZ(Math.PI / 2 - 0.35)
      .translate(3.72, 0.56, 0.15),
    M4_BRIGHT_STEEL
  );

  const upperShell = csgSubtract(rawUpper, [
    bcgBore,
    chSlot,
    chLatchNotch,
    bottomOpen,
    ejectionPort,
    feedRampL,
    feedRampR,
  ]);

  const parts: THREE.BufferGeometry[] = [upperShell];

  // Authentic left-flank forged cam-pin clearance dome bulge (X ∈ [1.15, 2.55])
  parts.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.24, 0.24, 1.38, 16)
        .scale(1, 1, 0.65)
        .rotateZ(Math.PI / 2)
        .translate(1.85, 1.42, -0.7),
      M4_ANODIZED_CHARCOAL
    )
  );

  // Top MIL-STD-1913 Flat-Top Beveled Picatinny Rail Spine + 13 Dovetail Cross-Lugs (Y = 1.88..2.12)
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(9.88, 0.11, 0.74).translate(-0.55, 1.92, 0),
      M4_ANODIZED_DARK
    )
  );
  for (let i = 0; i < 13; i++) {
    const lx = -5.1 + i * 0.76;
    parts.push(
      paintGeometry(
        createM1913RailProfile(0.44, 0.96, 0.74, 0.15).translate(
          lx,
          1.97,
          0
        ),
        M4_RAIL_BEVEL
      )
    );
  }

  // Ejection port dust-cover hinge pin knuckles + upper ball-detent catch rim
  for (const hx of [0.06, 3.38]) {
    parts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.11, 0.11, 0.28, 12)
          .rotateZ(Math.PI / 2)
          .translate(hx, 0.62, 0.77),
        M4_ANODIZED_CHARCOAL
      )
    );
  }
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.46, 0.09, 0.08).translate(1.72, 1.46, 0.74),
      M4_BRIGHT_STEEL
    )
  );

  // Sculpted Pyramidal Brass Shell Deflector ("Brunton Bump") behind right ejection port
  const deflectorPrism = paintGeometry(
    new THREE.ConeGeometry(0.44, 0.56, 4)
      .rotateX(Math.PI / 2)
      .rotateZ(Math.PI / 4)
      .scale(1.18, 0.96, 0.88)
      .translate(-0.32, 1.05, 0.94),
    M4_ANODIZED_CHARCOAL
  );
  parts.push(deflectorPrism);

  // Angled Forward Assist Housing, Roll-Pin Boss, Serrated Plunger Rim & Internal Ratchet Pawl
  const faHousing = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.33, 1.18, 18)
      .rotateZ(Math.PI / 2)
      .rotateY(-0.34)
      .translate(-2.05, 0.86, 0.86),
    M4_ANODIZED_CHARCOAL
  );
  const faPinBoss = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 0.64, 10).translate(
      -1.88,
      0.86,
      0.86
    ),
    M4_BRIGHT_STEEL
  );
  const faButton = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.24, 0.34, 20)
      .rotateZ(Math.PI / 2)
      .rotateY(-0.34)
      .translate(-2.7, 0.86, 1.09),
    M4_PARKERIZED_STEEL
  );
  const faPawl = paintGeometry(
    new THREE.BoxGeometry(0.36, 0.14, 0.18)
      .rotateY(-0.34)
      .translate(-1.35, 0.84, 0.62),
    M4_BRIGHT_STEEL
  );
  parts.push(faHousing, faPinBoss, faButton, faPawl);

  // Front Pivot Lug & Rear Takedown Lug w/ Drilled Pin Bores descending into Lower Receiver
  for (const lx of [3.85, -4.95]) {
    const lugRaw = paintGeometry(
      new THREE.BoxGeometry(0.62, 0.46, 0.62).translate(lx, 0.11, 0),
      M4_ANODIZED_CHARCOAL
    );
    const pinHole = paintGeometry(
      new THREE.CylinderGeometry(0.155, 0.155, 0.82, 14)
        .rotateX(Math.PI / 2)
        .translate(lx, 0.02, 0),
      M4_BRIGHT_STEEL
    );
    parts.push(csgSubtract(lugRaw, [pinHole]));
  }

  // USGI Steel Star-Toothed Barrel Nut (16 gas-tube scallops) + Weld Spring + Sloped Delta Ring (X ∈ [4.38, 5.44])
  const barrelNutCore = paintGeometry(
    new THREE.CylinderGeometry(0.69, 0.69, 0.48, 24)
      .rotateZ(Math.PI / 2)
      .translate(4.61, 1.05, 0),
    M4_BRIGHT_STEEL
  );
  const nutTeeth: THREE.BufferGeometry[] = [barrelNutCore];
  for (let t = 0; t < 16; t++) {
    const ang = (t * Math.PI * 2) / 16 + Math.PI / 16;
    const ty = 1.05 + Math.sin(ang) * 0.71;
    const tz = Math.cos(ang) * 0.71;
    nutTeeth.push(
      paintGeometry(
        new THREE.BoxGeometry(0.24, 0.075, 0.09)
          .rotateX(-ang)
          .translate(4.66, ty, tz),
        M4_BRIGHT_STEEL
      )
    );
  }
  const starNutMerged = mergeParts(nutTeeth);

  const deltaRingOuter = paintGeometry(
    new THREE.CylinderGeometry(0.86, 0.99, 0.82, 28)
      .rotateZ(-Math.PI / 2)
      .translate(5.03, 1.05, 0),
    M4_ANODIZED_CHARCOAL
  );
  const deltaGasNotch = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 1.4, 12)
      .rotateZ(Math.PI / 2)
      .translate(4.95, 1.67, 0),
    M4_ANODIZED_DARK
  );
  const deltaRingBore = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.56, 1.5, 22)
      .rotateZ(Math.PI / 2)
      .translate(4.85, 1.05, 0),
    M4_ANODIZED_DARK
  );
  parts.push(
    csgSubtract(starNutMerged, [deltaRingBore.clone(), deltaGasNotch.clone()]),
    csgSubtract(deltaRingOuter, [deltaRingBore, deltaGasNotch])
  );

  return applyM4a1UpperReceiverUVs(mergeParts(parts));
}

/**
 * U-02: Detachable USGI A2/M4 Carry Handle Sight w/ Dual Knurled Thumb Nuts, 6/3 Drum & L-Flip Diopter
 * (assembledPos: [-0.55, 2.12, 0] — clamps flush onto Upper Picatinny Rail!)
 */
export function buildM4a1CarryHandleGeometry(): THREE.BufferGeometry {
  const side = new THREE.Shape();
  side.moveTo(-4.65, -0.18);
  side.lineTo(4.45, -0.18);
  side.lineTo(4.45, 0.16);
  side.lineTo(3.55, 1.18);
  side.lineTo(-2.55, 1.32);
  side.lineTo(-3.15, 1.64);
  side.lineTo(-4.52, 1.64);
  side.lineTo(-4.65, 0.25);
  side.closePath();

  const fingerHole = new THREE.Path();
  fingerHole.moveTo(-2.15, 0.2);
  fingerHole.lineTo(2.55, 0.2);
  fingerHole.lineTo(2.95, 0.78);
  fingerHole.lineTo(-2.15, 0.86);
  fingerHole.closePath();
  side.holes.push(fingerHole);

  const rawHandle = new THREE.ExtrudeGeometry(side, {
    depth: 0.98,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 2,
  });
  rawHandle.translate(0, 0, -0.49);
  paintGeometry(rawHandle, M4_ANODIZED_CHARCOAL);

  const sightTrough = paintGeometry(
    new THREE.BoxGeometry(7.2, 0.42, 0.44).translate(0.65, 1.16, 0),
    M4_ANODIZED_DARK
  );
  const rearSightPocket = paintGeometry(
    new THREE.BoxGeometry(1.48, 0.72, 0.58).translate(-3.82, 1.38, 0),
    M4_ANODIZED_DARK
  );
  const railGroove = paintGeometry(
    new THREE.BoxGeometry(9.35, 0.17, 0.78).translate(-0.1, -0.14, 0),
    M4_ANODIZED_DARK
  );
  const handleBody = csgSubtract(rawHandle, [
    sightTrough,
    rearSightPocket,
    railGroove,
  ]);

  const subParts: THREE.BufferGeometry[] = [handleBody];

  // A2 Dual-Aperture L-Flip Sight Leaf: upright 0-200m ghost ring (Y_local = +1.40 => Y_world = 3.52) + forward 300-600m leg
  const peepOuter = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 0.11, 18)
      .rotateZ(Math.PI / 2)
      .translate(-3.85, 1.4, 0),
    M4_PARKERIZED_STEEL
  );
  const peepHole = paintGeometry(
    new THREE.CylinderGeometry(0.08, 0.08, 0.26, 14)
      .rotateZ(Math.PI / 2)
      .translate(-3.85, 1.4, 0),
    M4_ANODIZED_DARK
  );
  const flipSmallLeg = paintGeometry(
    new THREE.BoxGeometry(0.36, 0.08, 0.28).translate(-3.62, 1.2, 0),
    M4_PARKERIZED_STEEL
  );
  const sightBaseBlock = paintGeometry(
    new THREE.BoxGeometry(0.54, 0.34, 0.52).translate(-3.82, 1.14, 0),
    M4_PARKERIZED_STEEL
  );
  subParts.push(
    csgSubtract(peepOuter, [peepHole]),
    flipSmallLeg,
    sightBaseBlock
  );

  // Right Knurled Windage Drum + 6/3 Elevation Index Wheel
  subParts.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.22, 0.22, 0.3, 20)
        .rotateX(Math.PI / 2)
        .translate(-3.85, 1.36, 0.63),
      M4_RAIL_BEVEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.05, 0.05, 0.38, 10)
        .rotateZ(Math.PI / 2)
        .translate(-3.85, 1.36, 0.63),
      M4_BRIGHT_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.3, 0.3, 0.18, 24).translate(-3.82, 0.92, 0),
      M4_RAIL_BEVEL
    )
  );

  // Full-length Left Steel Clamp Bar + Twin Oversized Knurled Thumb Nuts & Cross-Bolts
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(8.65, 0.28, 0.12).translate(-0.1, -0.04, -0.54),
      M4_PARKERIZED_STEEL
    )
  );
  for (const nx of [-3.15, 2.55]) {
    subParts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.28, 0.28, 0.28, 20)
          .rotateX(Math.PI / 2)
          .translate(nx, -0.02, -0.69),
        M4_PARKERIZED_STEEL
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.11, 0.11, 1.38, 14)
          .rotateX(Math.PI / 2)
          .translate(nx, -0.02, -0.14),
        M4_BRIGHT_STEEL
      )
    );
    for (let r = 0; r < 8; r++) {
      const ang = (r * Math.PI * 2) / 8;
      subParts.push(
        paintGeometry(
          new THREE.BoxGeometry(0.05, 0.05, 0.26)
            .rotateZ(ang)
            .translate(
              nx + Math.cos(ang) * 0.27,
              -0.02 + Math.sin(ang) * 0.27,
              -0.69
            ),
          M4_BRIGHT_STEEL
        )
      );
    }
  }

  return sanitizeM4Geometry(mergeParts(subParts));
}

/**
 * U-03: T-Shaped Forged 7075-T6 Charging Handle & Spring-Loaded Tactical Latch (assembledPos: [-2.25, 1.66, 0])
 */
export function buildM4a1ChargingHandleGeometry(): THREE.BufferGeometry {
  const shaft = paintGeometry(
    new THREE.BoxGeometry(7.15, 0.25, 0.36).translate(0.1, 0, 0),
    M4_ANODIZED_CHARCOAL
  );
  const gasKeyChannel = paintGeometry(
    new THREE.BoxGeometry(6.75, 0.18, 0.23).translate(0.32, -0.06, 0),
    M4_ANODIZED_DARK
  );
  const stem = csgSubtract(shaft, [gasKeyChannel]);

  const tBar = paintGeometry(
    new THREE.BoxGeometry(0.54, 0.34, 2.32).translate(-3.55, 0, 0),
    M4_ANODIZED_CHARCOAL
  );
  const fingerCurlL = paintGeometry(
    new THREE.CylinderGeometry(0.2, 0.2, 0.34, 16).translate(-3.3, 0, -1.08),
    M4_ANODIZED_CHARCOAL
  );
  const fingerCurlR = paintGeometry(
    new THREE.CylinderGeometry(0.2, 0.2, 0.34, 16).translate(-3.3, 0, 1.08),
    M4_ANODIZED_CHARCOAL
  );
  // Spring-loaded left tactical latch claw + roll pin
  const tacLatch = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.28, 0.62)
      .rotateY(0.22)
      .translate(-3.68, 0, -0.84),
    M4_PARKERIZED_STEEL
  );
  const latchHook = paintGeometry(
    new THREE.BoxGeometry(0.26, 0.24, 0.16).translate(-3.26, 0, -0.58),
    M4_BRIGHT_STEEL
  );
  const latchRollPin = paintGeometry(
    new THREE.CylinderGeometry(0.045, 0.045, 0.38, 10).translate(
      -3.56,
      0,
      -0.88
    ),
    M4_BRIGHT_STEEL
  );
  // Front carrier dog hook & receiver guide ears
  const frontHook = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.34, 0.34).translate(3.6, -0.14, 0),
    M4_ANODIZED_CHARCOAL
  );
  const guideEars = paintGeometry(
    new THREE.BoxGeometry(0.34, 0.12, 0.48).translate(2.95, 0.06, 0),
    M4_ANODIZED_CHARCOAL
  );

  return sanitizeM4Geometry(
    mergeParts([
      stem,
      tBar,
      fingerCurlL,
      fingerCurlR,
      tacLatch,
      latchHook,
      latchRollPin,
      frontHook,
      guideEars,
    ])
  );
}

/**
 * U-04: Spring-Loaded Stamped Steel Ejection Port Dust Cover (assembledPos: [1.72, 0.62, 0.77])
 * Hinge axis at local Y = 0, Z = 0 so rx > 0 flips door down-outward during firing!
 */
export function buildM4a1DustCoverGeometry(): THREE.BufferGeometry {
  const door = paintGeometry(
    new THREE.BoxGeometry(3.08, 0.84, 0.065).translate(0, 0.42, 0.02),
    M4_PARKERIZED_STEEL
  );
  const outerRib = paintGeometry(
    new THREE.BoxGeometry(2.38, 0.36, 0.085).translate(0, 0.42, 0.055),
    M4_RAIL_BEVEL
  );
  // Rolled hinge knuckles wrapping around hinge rod at Y = 0, Z = 0
  const knuckleL = paintGeometry(
    new THREE.CylinderGeometry(0.1, 0.1, 0.72, 12)
      .rotateZ(Math.PI / 2)
      .translate(-1.05, 0, 0),
    M4_PARKERIZED_STEEL
  );
  const knuckleR = paintGeometry(
    new THREE.CylinderGeometry(0.1, 0.1, 0.72, 12)
      .rotateZ(Math.PI / 2)
      .translate(1.05, 0, 0),
    M4_PARKERIZED_STEEL
  );
  // Spring-loaded ball-detent housing + captive steel detent plunger
  const detentHousing = paintGeometry(
    new THREE.BoxGeometry(0.44, 0.22, 0.18).translate(0, 0.74, -0.05),
    M4_PARKERIZED_STEEL
  );
  const detentBall = paintGeometry(
    new THREE.SphereGeometry(0.065, 10, 10).translate(0, 0.84, -0.06),
    M4_BRIGHT_STEEL
  );
  const hingeRod = paintGeometry(
    new THREE.CylinderGeometry(0.062, 0.062, 3.72, 12)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    M4_BRIGHT_STEEL
  );
  const cClip = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 0.05, 12)
      .rotateZ(Math.PI / 2)
      .translate(1.62, 0, 0),
    M4_BRIGHT_STEEL
  );
  const hingeSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -0.52,
      end: 0.52,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.115,
      wireRadius: 0.024,
      coils: 8,
    }),
    M4_SPRING_STEEL
  );

  return sanitizeM4Geometry(
    mergeParts([
      door,
      outerRib,
      knuckleL,
      knuckleR,
      detentHousing,
      detentBall,
      hingeRod,
      cClip,
      hingeSpring,
    ])
  );
}

/**
 * U-05: Full-Auto M4A1 Stoner DI Bolt Carrier w/ Staked Carrier Key, Right Exhaust Vents & FA Serrations
 * (assembledPos: [-0.75, 1.05, 0] — coaxial at Y = 1.05, gas key funnel at Y_world = 1.67!)
 */
export function buildM4a1BoltCarrierGeometry(): THREE.BufferGeometry {
  const outerCyl = paintGeometry(
    new THREE.CylinderGeometry(0.515, 0.515, 7.0, 28)
      .rotateZ(Math.PI / 2)
      .translate(-0.25, 0, 0),
    M4_PARKERIZED_STEEL
  );

  // 4 Raised AR-15/M4 Carrier Bearing Pads along 45° quadrants
  const rails: THREE.BufferGeometry[] = [outerCyl];
  for (const ang of [
    Math.PI * 0.25,
    Math.PI * 0.75,
    -Math.PI * 0.25,
    -Math.PI * 0.75,
  ]) {
    rails.push(
      paintGeometry(
        new THREE.BoxGeometry(6.4, 0.14, 0.08)
          .rotateX(-ang)
          .translate(-0.25, Math.sin(ang) * 0.51, Math.cos(ang) * 0.51),
        M4_RAIL_BEVEL
      )
    );
  }
  const carrierRaw = mergeParts(rails);

  // Chrome-lined internal bolt/piston cylinder, rear firing-pin/hammer shroud bore, cam slot, right flat & 2 DI exhaust vents!
  const boltHole = paintGeometry(
    new THREE.CylinderGeometry(0.39, 0.39, 3.3, 22)
      .rotateZ(Math.PI / 2)
      .translate(1.75, 0, 0),
    M4_STAINLESS
  );
  const rearTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.33, 0.33, 4.2, 18)
      .rotateZ(Math.PI / 2)
      .translate(-1.85, 0, 0),
    M4_ANODIZED_DARK
  );
  // Bottom hammer/magazine-stripping slot (retaining M16/M4 full-auto rear bottom sear-trip shroud!)
  const hammerSlot = paintGeometry(
    new THREE.BoxGeometry(3.45, 0.58, 0.48).translate(1.32, -0.38, 0),
    M4_ANODIZED_DARK
  );
  // Helical cam-pin kidney slot on upper left/top of bolt head raceway
  const camKidney = paintGeometry(
    new THREE.BoxGeometry(0.96, 0.38, 0.42)
      .rotateY(0.4)
      .translate(2.02, 0.38, -0.1),
    M4_ANODIZED_DARK
  );
  const rightFlat = paintGeometry(
    new THREE.BoxGeometry(2.65, 0.68, 0.24).translate(1.62, 0.06, 0.52),
    M4_ANODIZED_DARK
  );
  // Iconic Stoner Direct-Impingement Twin Gas Exhaust Vent Ports on right ejection flat!
  const ventPort1 = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.45, 12)
      .rotateX(Math.PI / 2)
      .translate(1.22, -0.02, 0.42),
    M4_ANODIZED_DARK
  );
  const ventPort2 = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.45, 12)
      .rotateX(Math.PI / 2)
      .translate(1.56, -0.02, 0.42),
    M4_ANODIZED_DARK
  );
  // Left-flank firing-pin retaining cotter hole
  const cotterHole = paintGeometry(
    new THREE.CylinderGeometry(0.065, 0.065, 1.15, 10)
      .rotateX(Math.PI / 2)
      .translate(0.98, 0.22, 0),
    M4_ANODIZED_DARK
  );

  const carrierBody = csgSubtract(carrierRaw, [
    boltHole,
    rearTunnel,
    hammerSlot,
    camKidney,
    rightFlat,
    ventPort1,
    ventPort2,
    cotterHole,
  ]);

  const subParts: THREE.BufferGeometry[] = [carrierBody];

  // 12 Angled Forward-Assist Ratcheting Serration Notches along lower-right flank
  for (let s = 0; s < 12; s++) {
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.095, 0.22, 0.12)
          .rotateY(-0.2)
          .translate(-2.05 + s * 0.2, -0.19, 0.48),
        M4_BRIGHT_STEEL
      )
    );
  }

  // Staked Chrome-Lined Direct-Impingement Carrier Gas Key (Y_local = +0.62 => Y_world = 1.67)
  const keyBase = paintGeometry(
    new THREE.BoxGeometry(2.22, 0.24, 0.36).translate(1.34, 0.52, 0),
    M4_PARKERIZED_STEEL
  );
  const keyTubeOuter = paintGeometry(
    new THREE.CylinderGeometry(0.195, 0.175, 2.58, 20)
      .rotateZ(Math.PI / 2)
      .translate(1.58, 0.62, 0),
    M4_PARKERIZED_STEEL
  );
  const keyFunnelHole = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.105, 1.55, 16)
      .rotateZ(Math.PI / 2)
      .translate(2.35, 0.62, 0),
    M4_STAINLESS
  );
  const gasKey = csgSubtract(csgUnion([keyBase, keyTubeOuter]), [
    keyFunnelHole,
  ]);
  subParts.push(gasKey);

  // Twin Grade-8 Socket-Head Cap Screws + USGI Side Staking Swage Marks!
  for (const sx of [0.75, 1.65]) {
    const screwHead = paintGeometry(
      new THREE.CylinderGeometry(0.098, 0.098, 0.16, 14).translate(
        sx,
        0.74,
        0
      ),
      M4_BRIGHT_STEEL
    );
    const hexRecess = paintGeometry(
      new THREE.CylinderGeometry(0.052, 0.052, 0.12, 6).translate(sx, 0.8, 0),
      M4_ANODIZED_DARK
    );
    subParts.push(csgSubtract(screwHead, [hexRecess]));

    // Opposing staked carrier-key swage tabs biting into screw perimeter
    for (const sz of [-0.12, 0.12]) {
      subParts.push(
        paintGeometry(
          new THREE.BoxGeometry(0.11, 0.08, 0.06).translate(sx, 0.75, sz),
          M4_PARKERIZED_STEEL
        )
      );
    }
  }

  return sanitizeM4Geometry(mergeParts(subParts));
}

/**
 * U-06: 7-Lug Carpenter-158 Star Bolt w/ Claw Extractor, Spring Plunger Ejector, 3 Gas Rings & Cam Pin
 * (assembledPos: [2.45, 1.05, 0])
 */
export function buildM4a1BoltGeometry(): THREE.BufferGeometry {
  const shaft = paintGeometry(
    new THREE.CylinderGeometry(0.34, 0.34, 2.15, 24)
      .rotateZ(Math.PI / 2)
      .translate(0.02, 0, 0),
    M4_STAINLESS
  );
  // Stoner internal gas-piston expansion flange & ring journal
  const pistonShoulder = paintGeometry(
    new THREE.CylinderGeometry(0.375, 0.375, 0.24, 24)
      .rotateZ(Math.PI / 2)
      .translate(-0.78, 0, 0),
    M4_STAINLESS
  );
  const ringJournal = paintGeometry(
    new THREE.CylinderGeometry(0.335, 0.335, 0.42, 22)
      .rotateZ(Math.PI / 2)
      .translate(-1.05, 0, 0),
    M4_STAINLESS
  );
  const rearTail = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.48, 18)
      .rotateZ(Math.PI / 2)
      .translate(-1.42, 0, 0),
    M4_STAINLESS
  );

  const subParts: THREE.BufferGeometry[] = [
    shaft,
    pistonShoulder,
    ringJournal,
    rearTail,
  ];

  // 3 Staggered Stainless Steel Gas Sealing Rings around Stoner piston journal
  for (const rx of [-0.93, -1.05, -1.17]) {
    subParts.push(
      paintGeometry(
        new THREE.TorusGeometry(0.362, 0.024, 8, 22)
          .rotateY(Math.PI / 2)
          .translate(rx, 0, 0),
        M4_BRIGHT_STEEL
      )
    );
  }

  // 7 Radial Carpenter-158 Star Locking Lugs spaced at 45° (leaving k=0 at +Z for the Extractor!)
  for (let k = 1; k <= 7; k++) {
    const ang = (k * Math.PI) / 4;
    const ly = Math.sin(ang) * 0.415;
    const lz = Math.cos(ang) * 0.415;
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.46, 0.165, 0.22)
          .rotateX(-ang)
          .translate(1.06, ly, lz),
        M4_STAINLESS
      )
    );
  }

  // Right-side (+Z, k=0) Spring-Loaded Claw Extractor w/ Rim-Grabbing Hook & Pivot Pin
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(1.22, 0.18, 0.18).translate(0.68, 0, 0.4),
      M4_PARKERIZED_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.14, 0.19, 0.12).translate(1.25, 0, 0.33),
      M4_PARKERIZED_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.045, 0.045, 0.36, 10).translate(
        0.52,
        0,
        0.4
      ),
      M4_BRIGHT_STEEL
    ),
    // Ejector & Extractor cross roll pins
    paintGeometry(
      new THREE.CylinderGeometry(0.038, 0.038, 0.68, 10).translate(
        0.84,
        0,
        -0.12
      ),
      M4_BRIGHT_STEEL
    )
  );

  // Rectangular-Head Steel Cam Pin w/ Firing-Pin Bore at X_local = -0.32, Y_local = +0.48
  const camShaft = paintGeometry(
    new THREE.CylinderGeometry(0.135, 0.135, 0.62, 16).translate(
      -0.32,
      0.34,
      0
    ),
    M4_PARKERIZED_STEEL
  );
  const camHead = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.22, 0.25).translate(-0.32, 0.58, 0),
    M4_PARKERIZED_STEEL
  );
  subParts.push(camShaft, camHead);

  const solidBolt = mergeParts(subParts);

  // Carve recessed .378" bolt face cup & central firing-pin aperture
  const boltFaceCup = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 0.16, 20)
      .rotateZ(Math.PI / 2)
      .translate(1.25, 0, 0),
    M4_ANODIZED_DARK
  );
  const fpHole = paintGeometry(
    new THREE.CylinderGeometry(0.048, 0.048, 0.55, 12)
      .rotateZ(Math.PI / 2)
      .translate(1.12, 0, 0),
    M4_ANODIZED_DARK
  );
  const carvedBolt = csgSubtract(solidBolt, [boltFaceCup, fpHole]);

  // Add Spring-Loaded Cylindrical Plunger Ejector protruding onto bolt face (opposite extractor at k=4..5!)
  const ejAng = (5 * Math.PI) / 4;
  const ejectorPlunger = paintGeometry(
    new THREE.CylinderGeometry(0.052, 0.052, 0.16, 12)
      .rotateZ(Math.PI / 2)
      .translate(1.21, Math.sin(ejAng) * 0.155, Math.cos(ejAng) * 0.155),
    M4_BRIGHT_STEEL
  );

  return sanitizeM4Geometry(mergeParts([carvedBolt, ejectorPlunger]));
}

/**
 * U-07: Hard-Chromed Stepped Free-Floating Firing Pin & Retaining Cotter Pin (assembledPos: [0.15, 1.05, 0])
 */
export function buildM4a1FiringPinGeometry(): THREE.BufferGeometry {
  const rearButton = paintGeometry(
    new THREE.CylinderGeometry(0.145, 0.145, 0.24, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.18, 0, 0),
    M4_STAINLESS
  );
  const rearNeck = paintGeometry(
    new THREE.CylinderGeometry(0.078, 0.078, 0.42, 14)
      .rotateZ(Math.PI / 2)
      .translate(0.08, 0, 0),
    M4_STAINLESS
  );
  const stopFlange = paintGeometry(
    new THREE.CylinderGeometry(0.225, 0.225, 0.16, 20)
      .rotateZ(Math.PI / 2)
      .translate(0.32, 0, 0),
    M4_STAINLESS
  );
  const bodyShaft = paintGeometry(
    new THREE.CylinderGeometry(0.088, 0.108, 2.35, 16)
      .rotateZ(Math.PI / 2)
      .translate(1.52, 0, 0),
    M4_STAINLESS
  );
  const strikerNeedle = paintGeometry(
    new THREE.CylinderGeometry(0.036, 0.084, 0.9, 14)
      .rotateZ(Math.PI / 2)
      .translate(3.11, 0, 0),
    M4_STAINLESS
  );
  const needleTip = paintGeometry(
    new THREE.SphereGeometry(0.036, 10, 10).translate(3.56, 0, 0),
    M4_STAINLESS
  );
  const cotterPin = paintGeometry(
    new THREE.CylinderGeometry(0.034, 0.034, 0.88, 10)
      .rotateX(Math.PI / 2)
      .translate(0.1, 0.22, 0),
    M4_BRIGHT_STEEL
  );
  const cotterLoop = paintGeometry(
    new THREE.TorusGeometry(0.065, 0.024, 8, 14)
      .rotateY(Math.PI / 2)
      .translate(0.1, 0.22, -0.46),
    M4_BRIGHT_STEEL
  );

  return sanitizeM4Geometry(
    mergeParts([
      rearButton,
      rearNeck,
      stopFlange,
      bodyShaft,
      strikerNeedle,
      needleTip,
      cotterPin,
      cotterLoop,
    ])
  );
}

/**
 * U-08: Carbine-Length 347 Stainless Steel Direct-Impingement (DI) Gas Tube
 * (assembledPos: [8.35, 1.67, 0] — spans from BCG Gas Key X_world=1.95 to FSB Socket X_world=14.65!)
 */
export function buildM4a1GasTubeGeometry(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector3(-6.4, 0.0, 0),
    new THREE.Vector3(-4.1, 0.0, 0),
    new THREE.Vector3(-3.1, 0.08, 0),
    new THREE.Vector3(-2.1, 0.18, 0),
    new THREE.Vector3(6.3, 0.18, 0),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = paintGeometry(
    new THREE.TubeGeometry(curve, 48, 0.092, 14, false),
    M4_STAINLESS
  );
  // Bulbous ground sealing nozzle mating inside BCG staked gas key funnel
  const rearBulb = paintGeometry(
    new THREE.CylinderGeometry(0.105, 0.116, 0.28, 16)
      .rotateZ(Math.PI / 2)
      .translate(-6.26, 0, 0),
    M4_STAINLESS
  );
  const rearBore = paintGeometry(
    new THREE.CylinderGeometry(0.062, 0.062, 0.36, 12)
      .rotateZ(Math.PI / 2)
      .translate(-6.34, 0, 0),
    M4_ANODIZED_DARK
  );
  const nozzle = csgSubtract(rearBulb, [rearBore]);

  const frontCollar = paintGeometry(
    new THREE.CylinderGeometry(0.108, 0.108, 0.55, 14)
      .rotateZ(Math.PI / 2)
      .translate(6.02, 0.18, 0),
    M4_STAINLESS
  );
  const fsbRollPin = paintGeometry(
    new THREE.CylinderGeometry(0.04, 0.04, 0.56, 10)
      .rotateX(Math.PI / 2)
      .translate(6.05, 0.18, 0),
    M4_BRIGHT_STEEL
  );

  return sanitizeM4Geometry(
    mergeParts([tube, nozzle, frontCollar, fsbRollPin])
  );
}

/**
 * Helper: Solid 3D stamped corrugated aluminum heatshield arc liner (no zero-thickness open surfaces!).
 */
function createSolidHeatshieldLiner(
  lengthX: number,
  innerR: number,
  thickness: number,
  startAng: number,
  sweepAng: number
): THREE.BufferGeometry {
  const segs = 20;
  const s = new THREE.Shape();
  for (let i = 0; i <= segs; i++) {
    const a = startAng + (i / segs) * sweepAng;
    const z = Math.cos(a) * innerR;
    const y = Math.sin(a) * innerR;
    if (i === 0) s.moveTo(z, y);
    else s.lineTo(z, y);
  }
  const outerR = innerR + thickness;
  for (let i = segs; i >= 0; i--) {
    const a = startAng + (i / segs) * sweepAng;
    const ribBump = Math.sin((i / segs) * Math.PI * 5) * 0.012;
    const z = Math.cos(a) * (outerR + ribBump);
    const y = Math.sin(a) * (outerR + ribBump);
    s.lineTo(z, y);
  }
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: lengthX,
    bevelEnabled: false,
  });
  geo.rotateY(Math.PI / 2);
  geo.translate(-lengthX * 0.5, 0, 0);
  return paintGeometry(geo, M4_ALU_HEATSHIELD);
}

/**
 * U-09: KAC M4 RAS Upper Quad-Rail Forend (12/3/9-o'clock M1913 Rails + 7 Oval Vents + Ribbed Heatshield)
 * (assembledPos: [9.58, 1.05, 0] — spans X_local ∈ [-4.15, +4.15] => X_world ∈ [5.43, 13.73] flush!)
 */
export function buildM4a1RasUpperGeometry(): THREE.BufferGeometry {
  const length = 8.3;
  const prof = new THREE.Shape();
  prof.moveTo(-0.92, 0.02);
  prof.lineTo(-0.92, 0.34);
  prof.lineTo(-0.46, 0.88);
  prof.lineTo(0.46, 0.88);
  prof.lineTo(0.92, 0.34);
  prof.lineTo(0.92, 0.02);
  prof.closePath();

  const outerRaw = new THREE.ExtrudeGeometry(prof, {
    depth: length,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  outerRaw.rotateY(Math.PI / 2);
  outerRaw.translate(-length / 2, 0, 0);
  paintGeometry(outerRaw, M4_ANODIZED_CHARCOAL);

  // Hollow interior + 7 authentic KAC oval cooling vents per upper-45° flat
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.76, 0.76, length + 0.5, 26)
        .rotateZ(Math.PI / 2)
        .translate(0, 0, 0),
      M4_ANODIZED_DARK
    ),
  ];

  for (let v = 0; v < 7; v++) {
    const vx = -3.3 + v * 1.1;
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.2, 0.2, 2.2, 14)
          .scale(1.18, 1, 0.86)
          .rotateX(Math.PI / 4)
          .translate(vx, 0.56, 0.56),
        M4_ANODIZED_DARK
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.2, 0.2, 2.2, 14)
          .scale(1.18, 1, 0.86)
          .rotateX(-Math.PI / 4)
          .translate(vx, 0.56, -0.56),
        M4_ANODIZED_DARK
      )
    );
  }

  const upperBody = csgSubtract(outerRaw, cutters);
  const parts: THREE.BufferGeometry[] = [upperBody];

  // Solid 3D Stamped Corrugated Aluminum Thermal Heatshield Liner inside upper RAS
  parts.push(
    createSolidHeatshieldLiner(
      7.45,
      0.675,
      0.036,
      Math.PI * 0.1,
      Math.PI * 0.8
    )
  );

  // Top 12-o'clock + Left/Right 3 & 9-o'clock MIL-STD-1913 Beveled Picatinny Spines & 11 Cross-Lugs
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(length, 0.11, 0.74).translate(0, 0.9, 0),
      M4_ANODIZED_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(length, 0.74, 0.11).translate(0, 0.14, 0.95),
      M4_ANODIZED_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(length, 0.74, 0.11).translate(0, 0.14, -0.95),
      M4_ANODIZED_DARK
    )
  );

  for (let i = 0; i < 11; i++) {
    const lx = -3.75 + i * 0.75;
    parts.push(
      paintGeometry(
        createM1913RailProfile(0.42, 0.96, 0.74, 0.14).translate(lx, 0.94, 0),
        M4_RAIL_BEVEL
      ),
      paintGeometry(
        createM1913RailProfile(0.42, 0.96, 0.74, 0.14)
          .rotateX(Math.PI / 2)
          .translate(lx, 0.14, 0.98),
        M4_RAIL_BEVEL
      ),
      paintGeometry(
        createM1913RailProfile(0.42, 0.96, 0.74, 0.14)
          .rotateX(-Math.PI / 2)
          .translate(lx, 0.14, -0.98),
        M4_RAIL_BEVEL
      )
    );
  }

  // KAC Rear Barrel-Nut Clamp Screw & Front Handguard-Cap Lip
  parts.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.14, 0.14, 0.22, 16).translate(
        -3.45,
        1.02,
        0
      ),
      M4_BRIGHT_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.18, 0.34, 0.56).translate(-3.95, 0.66, 0),
      M4_BRIGHT_STEEL
    )
  );

  return sanitizeM4Geometry(mergeParts(parts));
}

/**
 * U-10: KAC M4 RAS Lower 6-O'Clock Picatinny Rail Forend w/ Cooling Vents & Ribbed Aluminum Heatshield
 * (assembledPos: [9.58, 1.05, 0] — mates cleanly under U-09!)
 */
export function buildM4a1RasLowerGeometry(): THREE.BufferGeometry {
  const length = 8.3;
  const prof = new THREE.Shape();
  prof.moveTo(-0.88, -0.02);
  prof.lineTo(0.88, -0.02);
  prof.lineTo(0.88, -0.32);
  prof.lineTo(0.46, -0.86);
  prof.lineTo(-0.46, -0.86);
  prof.lineTo(-0.88, -0.32);
  prof.closePath();

  const outerRaw = new THREE.ExtrudeGeometry(prof, {
    depth: length,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  outerRaw.rotateY(Math.PI / 2);
  outerRaw.translate(-length / 2, 0, 0);
  paintGeometry(outerRaw, M4_ANODIZED_CHARCOAL);

  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.75, 0.75, length + 0.5, 26)
        .rotateZ(Math.PI / 2)
        .translate(0, 0, 0),
      M4_ANODIZED_DARK
    ),
  ];

  for (let v = 0; v < 7; v++) {
    const vx = -3.3 + v * 1.1;
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.19, 0.19, 2.2, 14)
          .scale(1.18, 1, 0.86)
          .rotateX(-Math.PI / 4)
          .translate(vx, -0.54, 0.54),
        M4_ANODIZED_DARK
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.19, 0.19, 2.2, 14)
          .scale(1.18, 1, 0.86)
          .rotateX(Math.PI / 4)
          .translate(vx, -0.54, -0.54),
        M4_ANODIZED_DARK
      )
    );
  }

  const lowerBody = csgSubtract(outerRaw, cutters);
  const parts: THREE.BufferGeometry[] = [lowerBody];

  // Solid 3D Stamped Corrugated Aluminum Lower Heatshield Liner
  parts.push(
    createSolidHeatshieldLiner(
      7.45,
      0.665,
      0.036,
      Math.PI * 1.1,
      Math.PI * 0.8
    )
  );

  // Bottom 6-o'clock MIL-STD-1913 Beveled Picatinny Rail + 11 Cross-Lugs
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(length, 0.11, 0.74).translate(0, -0.88, 0),
      M4_ANODIZED_DARK
    )
  );
  for (let i = 0; i < 11; i++) {
    const lx = -3.75 + i * 0.75;
    parts.push(
      paintGeometry(
        createM1913RailProfile(0.42, 0.96, 0.74, 0.14)
          .rotateX(Math.PI)
          .translate(lx, -0.92, 0),
        M4_RAIL_BEVEL
      )
    );
  }

  return sanitizeM4Geometry(mergeParts(parts));
}
