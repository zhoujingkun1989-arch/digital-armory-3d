import * as THREE from 'three';
import {
  createHelicalSpring,
  csgSubtract,
  csgUnion,
  mergeParts,
  paintGeometry,
} from '../springHelper';

export const M4_ANODIZED_CHARCOAL = '#282c32';
export const M4_ANODIZED_DARK = '#1c2026';
export const M4_PARKERIZED_STEEL = '#2f353d';
export const M4_BRIGHT_STEEL = '#cbd5e1';
export const M4_STAINLESS = '#e2e8f0';
export const M4_ALU_HEATSHIELD = '#d1d9e4';
export const M4_POLYMER = '#1e2228';
export const M4_POLYMER_ACCENT = '#15181d';
export const M4_RUBBER = '#121418';
export const M4_BUFFER_GOLD = '#b5945b';
export const M4_BUMPER_TAN = '#a16207';
export const M4_SPRING_STEEL = '#94a3b8';
export const M4_STANAG_GREY = '#525860';
export const M4_FOLLOWER_TAN = '#ea580c';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function fractPos(v: number): number {
  return v - Math.floor(v);
}

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();
const fNorm = new THREE.Vector3();

export function m4TriInfo(
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
  const cr = col ? (col.getX(i0) + col.getX(i1) + col.getX(i2)) / 3 : 0.2;
  return { cx, cy, cz, cr, fnx: fNorm.x, fny: fNorm.y, fnz: fNorm.z };
}

/**
 * Unwraps U-01 Forged Flat-Top M4A1 Upper Receiver onto m4a1_receiver_{albedo,normal,roughness}.png:
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
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps F-01 Forged 7075-T6 M4A1 Lower Receiver onto 2048x1024 m4a1_receiver_{albedo,normal,roughness}.png:
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
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
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

      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = vCoord;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// GROUP 1 ('slide'): UPPER RECEIVER, CARRY HANDLE, BCG & KAC RAS QUAD RAILS (10)
// ============================================================================

/**
 * U-01: Forged Flat-Top M4A1 Upper Receiver w/ Forward Assist, Brass Deflector & Delta Ring
 * (assembledPos: [0, 0, 0] — bottom split deck at Y = 0.28 meets lower receiver flush!)
 */
export function buildM4a1UpperReceiverGeometry(): THREE.BufferGeometry {
  // Forged cross-section profile in (Z, Y) extruded along X ∈ [-5.60, +4.40]
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

  // Cylindrical BCG bore (Y = 1.05) + top gas-key / charging-handle channel + bottom FCG/magwell clearance + right ejection port!
  const bcgBore = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.58, 10.4, 24)
      .rotateZ(Math.PI / 2)
      .translate(-0.6, 1.05, 0),
    M4_ANODIZED_DARK
  );
  const chSlot = paintGeometry(
    new THREE.BoxGeometry(10.3, 0.36, 0.44).translate(-0.6, 1.62, 0),
    M4_ANODIZED_DARK
  );
  const bottomOpen = paintGeometry(
    new THREE.BoxGeometry(8.85, 0.65, 1.06).translate(-0.55, 0.52, 0),
    M4_ANODIZED_DARK
  );
  const ejectionPort = paintGeometry(
    new THREE.BoxGeometry(3.05, 0.82, 0.68).translate(1.72, 1.04, 0.58),
    M4_ANODIZED_DARK
  );

  const upperShell = csgSubtract(rawUpper, [
    bcgBore,
    chSlot,
    bottomOpen,
    ejectionPort,
  ]);

  const parts: THREE.BufferGeometry[] = [upperShell];

  // Top MIL-STD-1913 Flat-Top Picatinny Rail Spine + 13 Recoil Cross-Lugs (Y = 1.88..2.12)
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(9.85, 0.14, 0.78).translate(-0.55, 1.93, 0),
      M4_ANODIZED_CHARCOAL
    )
  );
  for (let i = 0; i < 13; i++) {
    const lx = -5.1 + i * 0.76;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.42, 0.14, 0.96).translate(lx, 2.05, 0),
        M4_ANODIZED_CHARCOAL
      )
    );
  }

  // Iconic Pyramidal Brass Shell Deflector ("Brunton Bump") behind right ejection port
  parts.push(
    paintGeometry(
      new THREE.ConeGeometry(0.42, 0.52, 4)
        .rotateX(Math.PI / 2)
        .rotateZ(Math.PI / 4)
        .scale(1.15, 0.95, 0.85)
        .translate(-0.32, 1.05, 0.94),
      M4_ANODIZED_CHARCOAL
    )
  );

  // Angled Teardrop/Round Forward Assist Housing & Plunger Button on Right Rear
  const faHousing = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.32, 1.15, 18)
      .rotateZ(Math.PI / 2)
      .rotateY(-0.34)
      .translate(-2.05, 0.86, 0.86),
    M4_ANODIZED_CHARCOAL
  );
  const faButton = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.24, 0.34, 18)
      .rotateZ(Math.PI / 2)
      .rotateY(-0.34)
      .translate(-2.68, 0.86, 1.08),
    M4_PARKERIZED_STEEL
  );
  parts.push(faHousing, faButton);

  // Front Pivot Lug & Rear Takedown Lug descending into Lower Receiver
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.58, 0.42, 0.62).translate(3.85, 0.12, 0),
      M4_ANODIZED_CHARCOAL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.58, 0.42, 0.62).translate(-4.95, 0.12, 0),
      M4_ANODIZED_CHARCOAL
    )
  );

  // Front Steel Toothed Barrel Nut + Tapered Black Anodized Delta Slip Ring (X ∈ [4.38, 5.44] -> meets RAS flush!)
  const barrelNut = paintGeometry(
    new THREE.CylinderGeometry(0.72, 0.72, 0.46, 24)
      .rotateZ(Math.PI / 2)
      .translate(4.61, 1.05, 0),
    M4_BRIGHT_STEEL
  );
  const deltaRingOuter = paintGeometry(
    new THREE.CylinderGeometry(0.86, 0.98, 0.82, 28)
      .rotateZ(-Math.PI / 2)
      .translate(5.03, 1.05, 0),
    M4_ANODIZED_CHARCOAL
  );
  const deltaRingBore = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.56, 1.25, 22)
      .rotateZ(Math.PI / 2)
      .translate(4.95, 1.05, 0),
    M4_ANODIZED_DARK
  );
  parts.push(barrelNut, csgSubtract(deltaRingOuter, [deltaRingBore]));

  return applyM4a1UpperReceiverUVs(mergeParts(parts));
}

/**
 * U-02: Detachable USGI A2 Carry Handle Sight w/ Dual Thumb Nuts & Flip Diopter
 * (assembledPos: [-0.55, 2.12, 0] — clamps flush onto Upper Picatinny Rail!)
 */
export function buildM4a1CarryHandleGeometry(): THREE.BufferGeometry {
  // Side silhouette in (X, Y) of forged A2 detachable carry handle
  const side = new THREE.Shape();
  side.moveTo(-4.65, -0.18);
  side.lineTo(4.45, -0.18);
  side.lineTo(4.45, 0.16);
  side.lineTo(3.55, 1.18);
  side.lineTo(-2.55, 1.32);
  side.lineTo(-3.15, 1.62); // Protected A2 rear sight tower
  side.lineTo(-4.52, 1.62);
  side.lineTo(-4.65, 0.25);
  side.closePath();

  // Central carry-handle finger opening hole!
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

  // Carve sighting trough along top arch & rear sight protective U-channel
  const sightTrough = paintGeometry(
    new THREE.BoxGeometry(7.2, 0.42, 0.44).translate(0.65, 1.16, 0),
    M4_ANODIZED_DARK
  );
  const rearSightPocket = paintGeometry(
    new THREE.BoxGeometry(1.45, 0.68, 0.56).translate(-3.82, 1.38, 0),
    M4_ANODIZED_DARK
  );
  const railGroove = paintGeometry(
    new THREE.BoxGeometry(9.3, 0.16, 0.76).translate(-0.1, -0.14, 0),
    M4_ANODIZED_DARK
  );
  const handleBody = csgSubtract(rawHandle, [
    sightTrough,
    rearSightPocket,
    railGroove,
  ]);

  // A2 Flip Peep Aperture (centered at Y_local = +1.40 => Y_world = 3.52 co-witnessing FSB!)
  const peepOuter = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 0.12, 18)
      .rotateZ(Math.PI / 2)
      .translate(-3.85, 1.4, 0),
    M4_PARKERIZED_STEEL
  );
  const peepHole = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.26, 14)
      .rotateZ(Math.PI / 2)
      .translate(-3.85, 1.4, 0),
    M4_ANODIZED_DARK
  );
  const peep = csgSubtract(peepOuter, [peepHole]);

  // Right Windage Drum + Elevation Wheel + Twin Left Knurled Clamp Thumb Nuts
  const windageDrum = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.21, 0.28, 18)
      .rotateX(Math.PI / 2)
      .translate(-3.85, 1.36, 0.62),
    M4_PARKERIZED_STEEL
  );
  const elevDial = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.18, 20).translate(-3.82, 0.92, 0),
    M4_PARKERIZED_STEEL
  );
  const clampPlate = paintGeometry(
    new THREE.BoxGeometry(8.6, 0.28, 0.12).translate(-0.1, -0.04, -0.54),
    M4_PARKERIZED_STEEL
  );
  const nutRear = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 0.28, 20)
      .rotateX(Math.PI / 2)
      .translate(-3.15, -0.02, -0.68),
    M4_PARKERIZED_STEEL
  );
  const nutFront = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 0.28, 20)
      .rotateX(Math.PI / 2)
      .translate(2.55, -0.02, -0.68),
    M4_PARKERIZED_STEEL
  );

  return mergeParts([
    handleBody,
    peep,
    windageDrum,
    elevDial,
    clampPlate,
    nutRear,
    nutFront,
  ]);
}

/**
 * U-03: T-Shaped Forged Aluminum Charging Handle & Tactical Latch (assembledPos: [-2.25, 1.66, 0])
 */
export function buildM4a1ChargingHandleGeometry(): THREE.BufferGeometry {
  const shaft = paintGeometry(
    new THREE.BoxGeometry(7.1, 0.24, 0.36).translate(0.1, 0, 0),
    M4_ANODIZED_CHARCOAL
  );
  const shaftGroove = paintGeometry(
    new THREE.BoxGeometry(6.6, 0.16, 0.22).translate(0.3, -0.06, 0),
    M4_ANODIZED_DARK
  );
  const stem = csgSubtract(shaft, [shaftGroove]);

  // Iconic rear T-bar finger hooks + spring-loaded left latch
  const tBar = paintGeometry(
    new THREE.BoxGeometry(0.52, 0.34, 2.28).translate(-3.55, 0, 0),
    M4_ANODIZED_CHARCOAL
  );
  const fingerCurlL = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 0.34, 14).translate(
      -3.32,
      0,
      -1.08
    ),
    M4_ANODIZED_CHARCOAL
  );
  const fingerCurlR = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 0.34, 14).translate(-3.32, 0, 1.08),
    M4_ANODIZED_CHARCOAL
  );
  const tacLatch = paintGeometry(
    new THREE.BoxGeometry(0.38, 0.28, 0.56)
      .rotateY(0.22)
      .translate(-3.68, 0, -0.86),
    M4_BRIGHT_STEEL
  );
  const frontHook = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.32, 0.34).translate(3.58, -0.14, 0),
    M4_ANODIZED_CHARCOAL
  );

  return mergeParts([stem, tBar, fingerCurlL, fingerCurlR, tacLatch, frontHook]);
}

/**
 * U-04: Spring-Loaded Ejection Port Dust Cover (assembledPos: [1.72, 0.62, 0.77])
 * Hinge axis at local Y = 0, Z = 0 so rx > 0 flips door down-outward during firing!
 */
export function buildM4a1DustCoverGeometry(): THREE.BufferGeometry {
  const door = paintGeometry(
    new THREE.BoxGeometry(3.08, 0.84, 0.07).translate(0, 0.42, 0.02),
    M4_PARKERIZED_STEEL
  );
  const rib = paintGeometry(
    new THREE.BoxGeometry(2.35, 0.38, 0.09).translate(0, 0.42, 0.05),
    M4_PARKERIZED_STEEL
  );
  const detentHousing = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.22, 0.18).translate(0, 0.74, -0.05),
    M4_BRIGHT_STEEL
  );
  const hingeRod = paintGeometry(
    new THREE.CylinderGeometry(0.065, 0.065, 3.65, 12)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    M4_BRIGHT_STEEL
  );
  const hingeSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -0.45,
      end: 0.45,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.11,
      wireRadius: 0.024,
      coils: 7,
    }),
    M4_SPRING_STEEL
  );
  return mergeParts([door, rib, detentHousing, hingeRod, hingeSpring]);
}

/**
 * U-05: Full-Auto M4A1 Bolt Carrier w/ Staked Chrome-Lined DI Gas Key
 * (assembledPos: [-0.75, 1.05, 0] — coaxial at Y = 1.05, gas key funnel at Y_world = 1.67!)
 */
export function buildM4a1BoltCarrierGeometry(): THREE.BufferGeometry {
  const outerCyl = paintGeometry(
    new THREE.CylinderGeometry(0.53, 0.53, 7.0, 26)
      .rotateZ(Math.PI / 2)
      .translate(-0.25, 0, 0),
    M4_PARKERIZED_STEEL
  );

  // Carve front bolt cavity, bottom hammer/mag feed slot, right ejection flat & cam-pin kidney slot!
  const boltHole = paintGeometry(
    new THREE.CylinderGeometry(0.39, 0.39, 3.2, 20)
      .rotateZ(Math.PI / 2)
      .translate(1.75, 0, 0),
    M4_ANODIZED_DARK
  );
  const hammerSlot = paintGeometry(
    new THREE.BoxGeometry(3.2, 0.58, 0.48).translate(1.45, -0.38, 0),
    M4_ANODIZED_DARK
  );
  const camKidney = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.36, 0.42)
      .rotateY(0.42)
      .translate(2.05, 0.38, -0.12),
    M4_ANODIZED_DARK
  );
  const rightFlat = paintGeometry(
    new THREE.BoxGeometry(2.6, 0.68, 0.25).translate(1.65, 0.06, 0.54),
    M4_ANODIZED_DARK
  );

  const carrierBody = csgSubtract(outerCyl, [
    boltHole,
    hammerSlot,
    camKidney,
    rightFlat,
  ]);

  const subParts: THREE.BufferGeometry[] = [carrierBody];

  // 10 Angled Forward-Assist Ratcheting Serrations along lower-right flank
  for (let s = 0; s < 10; s++) {
    subParts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.11, 0.22, 0.14).translate(
          -1.85 + s * 0.22,
          -0.18,
          0.49
        ),
        M4_BRIGHT_STEEL
      )
    );
  }

  // Staked Chrome-Lined Direct-Impingement Gas Key on top of carrier (Y_local = +0.62 => Y_world = 1.67)
  const keyBase = paintGeometry(
    new THREE.BoxGeometry(2.15, 0.24, 0.36).translate(1.35, 0.52, 0),
    M4_PARKERIZED_STEEL
  );
  const keyTubeOuter = paintGeometry(
    new THREE.CylinderGeometry(0.19, 0.17, 2.55, 18)
      .rotateZ(Math.PI / 2)
      .translate(1.58, 0.62, 0),
    M4_PARKERIZED_STEEL
  );
  const keyFunnelHole = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.11, 1.4, 14)
      .rotateZ(Math.PI / 2)
      .translate(2.35, 0.62, 0),
    M4_ANODIZED_DARK
  );
  const gasKey = csgSubtract(csgUnion([keyBase, keyTubeOuter]), [
    keyFunnelHole,
  ]);
  subParts.push(gasKey);

  // Twin Staked Hex Screws on top of Gas Key!
  for (const sx of [0.75, 1.65]) {
    subParts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.095, 0.095, 0.16, 12).translate(
          sx,
          0.74,
          0
        ),
        M4_BRIGHT_STEEL
      )
    );
  }

  return mergeParts(subParts);
}

/**
 * U-06: 7-Lug Carpenter-158 Rotating Bolt w/ Extractor, Plunger Ejector, Gas Rings & Cam Pin
 * (assembledPos: [2.45, 1.05, 0])
 */
export function buildM4a1BoltGeometry(): THREE.BufferGeometry {
  const shaft = paintGeometry(
    new THREE.CylinderGeometry(0.35, 0.35, 2.35, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.08, 0, 0),
    M4_STAINLESS
  );
  const rearTail = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.62, 18)
      .rotateZ(Math.PI / 2)
      .translate(-1.32, 0, 0),
    M4_STAINLESS
  );

  const subParts: THREE.BufferGeometry[] = [shaft, rearTail];

  // 3 Stainless Gas Sealing Rings around rear bolt tail!
  for (const rx of [-0.92, -1.04, -1.16]) {
    subParts.push(
      paintGeometry(
        new THREE.TorusGeometry(0.355, 0.025, 8, 20)
          .rotateY(Math.PI / 2)
          .translate(rx, 0, 0),
        M4_BRIGHT_STEEL
      )
    );
  }

  // 7 Radial Locking Lugs spaced at 45° intervals (leaving k=0 at +Z for the Extractor!)
  for (let k = 1; k <= 7; k++) {
    const ang = (k * Math.PI) / 4;
    const ly = Math.sin(ang) * 0.42;
    const lz = Math.cos(ang) * 0.42;
    const lug = paintGeometry(
      new THREE.BoxGeometry(0.46, 0.16, 0.22)
        .rotateX(-ang)
        .translate(1.06, ly, lz),
      M4_STAINLESS
    );
    subParts.push(lug);
  }

  // Right-side (+Z, k=0) Spring-Loaded Extractor Claw + Square-Head Cam Pin at Y_local = +0.50!
  subParts.push(
    paintGeometry(
      new THREE.BoxGeometry(1.18, 0.18, 0.2).translate(0.72, 0, 0.41),
      M4_PARKERIZED_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.28, 0.44, 0.24).translate(-0.32, 0.48, 0),
      M4_PARKERIZED_STEEL
    )
  );

  const solidBolt = mergeParts(subParts);
  const boltFaceCup = paintGeometry(
    new THREE.CylinderGeometry(0.25, 0.25, 0.16, 18)
      .rotateZ(Math.PI / 2)
      .translate(1.25, 0, 0),
    M4_ANODIZED_DARK
  );
  return csgSubtract(solidBolt, [boltFaceCup]);
}

/**
 * U-07: Chrome-Plated Stepped Firing Pin & Retaining Cotter Pin (assembledPos: [0.15, 1.05, 0])
 * Rear button head sits at X_local = -0.15 (X_world = 0.00) right in the hammer swing path!
 */
export function buildM4a1FiringPinGeometry(): THREE.BufferGeometry {
  const rearButton = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 0.26, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.18, 0, 0),
    M4_STAINLESS
  );
  const stopFlange = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 0.16, 18)
      .rotateZ(Math.PI / 2)
      .translate(0.32, 0, 0),
    M4_STAINLESS
  );
  const bodyShaft = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.105, 2.35, 16)
      .rotateZ(Math.PI / 2)
      .translate(1.52, 0, 0),
    M4_STAINLESS
  );
  const strikerNeedle = paintGeometry(
    new THREE.CylinderGeometry(0.036, 0.085, 0.92, 14)
      .rotateZ(Math.PI / 2)
      .translate(3.12, 0, 0),
    M4_STAINLESS
  );
  const cotterPin = paintGeometry(
    new THREE.CylinderGeometry(0.035, 0.035, 0.88, 10)
      .rotateX(Math.PI / 2)
      .translate(0.1, 0.22, 0),
    M4_BRIGHT_STEEL
  );
  return mergeParts([
    rearButton,
    stopFlange,
    bodyShaft,
    strikerNeedle,
    cotterPin,
  ]);
}

/**
 * U-08: Carbine-Length 304 Stainless Steel Direct-Impingement (DI) Gas Tube
 * (assembledPos: [8.35, 1.67, 0] — spans from BCG Gas Key X_world=1.95 to FSB Socket X_world=14.65!)
 */
export function buildM4a1GasTubeGeometry(): THREE.BufferGeometry {
  // Smooth Stoner S-bend curve from rear Gas Key level (Y_local = 0) up into FSB upper gas bore (Y_local = +0.18)
  const pts = [
    new THREE.Vector3(-6.4, 0.0, 0),
    new THREE.Vector3(-4.1, 0.0, 0),
    new THREE.Vector3(-3.1, 0.08, 0),
    new THREE.Vector3(-2.1, 0.18, 0),
    new THREE.Vector3(6.3, 0.18, 0),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = paintGeometry(
    new THREE.TubeGeometry(curve, 44, 0.095, 12, false),
    M4_STAINLESS
  );
  const rearFlare = paintGeometry(
    new THREE.CylinderGeometry(0.115, 0.105, 0.32, 14)
      .rotateZ(Math.PI / 2)
      .translate(-6.25, 0, 0),
    M4_STAINLESS
  );
  const fsbRollPin = paintGeometry(
    new THREE.CylinderGeometry(0.04, 0.04, 0.56, 10)
      .rotateX(Math.PI / 2)
      .translate(6.05, 0.18, 0),
    M4_BRIGHT_STEEL
  );
  return mergeParts([tube, rearFlare, fsbRollPin]);
}

/**
 * U-09: KAC M4 RAS Upper Quad-Rail Forend (12/3/9-o'clock Picatinny Rails + Vents + Aluminum Heatshield)
 * (assembledPos: [9.58, 1.05, 0] — spans X_local ∈ [-4.15, +4.15] => X_world ∈ [5.43, 13.73] flush!)
 */
export function buildM4a1RasUpperGeometry(): THREE.BufferGeometry {
  const length = 8.3;
  // Upper semi-octagonal aluminum body (Y_local ∈ [+0.02, +0.92])
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

  // Hollow interior + 6 KAC oval barrel cooling holes per upper-45° flat!
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.76, 0.76, length + 0.4, 24)
        .rotateZ(Math.PI / 2)
        .translate(0, 0, 0),
      M4_ANODIZED_DARK
    ),
  ];

  for (let v = 0; v < 6; v++) {
    const vx = -3.1 + v * 1.24;
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.24, 0.24, 2.2, 14)
          .rotateZ(0)
          .rotateX(Math.PI / 4)
          .translate(vx, 0.56, 0.56),
        M4_ANODIZED_DARK
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.24, 0.24, 2.2, 14)
          .rotateX(-Math.PI / 4)
          .translate(vx, 0.56, -0.56),
        M4_ANODIZED_DARK
      )
    );
  }

  const upperBody = csgSubtract(outerRaw, cutters);
  const parts: THREE.BufferGeometry[] = [upperBody];

  // Shiny Stamped Aluminum Thermal Liner Heatshield inside upper RAS!
  const shieldArc = new THREE.CylinderGeometry(
    0.69,
    0.69,
    7.5,
    20,
    1,
    true,
    -Math.PI * 0.42,
    Math.PI * 0.84
  );
  shieldArc.rotateZ(Math.PI / 2);
  shieldArc.rotateX(Math.PI / 2);
  parts.push(paintGeometry(shieldArc, M4_ALU_HEATSHIELD));

  // Top 12-o'clock Picatinny Rail (coplanar with Upper Receiver at Y_world = 1.93..2.12!) + Left/Right 3 & 9 o'clock Rails!
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(length, 0.12, 0.78).translate(0, 0.9, 0),
      M4_ANODIZED_CHARCOAL
    ),
    paintGeometry(
      new THREE.BoxGeometry(length, 0.58, 0.12).translate(0, 0.12, 0.96),
      M4_ANODIZED_CHARCOAL
    ),
    paintGeometry(
      new THREE.BoxGeometry(length, 0.58, 0.12).translate(0, 0.12, -0.96),
      M4_ANODIZED_CHARCOAL
    )
  );

  for (let i = 0; i < 11; i++) {
    const lx = -3.75 + i * 0.75;
    // Top rail teeth
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.42, 0.14, 0.96).translate(lx, 1.0, 0),
        M4_ANODIZED_CHARCOAL
      ),
      // Right 3-o'clock rail teeth
      paintGeometry(
        new THREE.BoxGeometry(0.42, 0.76, 0.14).translate(lx, 0.12, 1.05),
        M4_ANODIZED_CHARCOAL
      ),
      // Left 9-o'clock rail teeth
      paintGeometry(
        new THREE.BoxGeometry(0.42, 0.76, 0.14).translate(lx, 0.12, -1.05),
        M4_ANODIZED_CHARCOAL
      )
    );
  }

  // KAC Rear Barrel-Nut Locking Clamp Screw
  parts.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.14, 0.14, 0.22, 14).translate(-3.45, 1.06, 0),
      M4_BRIGHT_STEEL
    )
  );

  return mergeParts(parts);
}

/**
 * U-10: KAC M4 RAS Lower Picatinny Rail Forend w/ Cooling Vents & Aluminum Heatshield
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
      new THREE.CylinderGeometry(0.75, 0.75, length + 0.4, 24)
        .rotateZ(Math.PI / 2)
        .translate(0, 0, 0),
      M4_ANODIZED_DARK
    ),
  ];

  for (let v = 0; v < 6; v++) {
    const vx = -3.1 + v * 1.24;
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.22, 0.22, 2.2, 14)
          .rotateX(-Math.PI / 4)
          .translate(vx, -0.54, 0.54),
        M4_ANODIZED_DARK
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.22, 0.22, 2.2, 14)
          .rotateX(Math.PI / 4)
          .translate(vx, -0.54, -0.54),
        M4_ANODIZED_DARK
      )
    );
  }

  const lowerBody = csgSubtract(outerRaw, cutters);
  const parts: THREE.BufferGeometry[] = [lowerBody];

  // Lower Stamped Aluminum Heatshield Liner
  const lowerShield = new THREE.CylinderGeometry(
    0.68,
    0.68,
    7.5,
    20,
    1,
    true,
    Math.PI * 0.58,
    Math.PI * 0.84
  );
  lowerShield.rotateZ(Math.PI / 2);
  lowerShield.rotateX(Math.PI / 2);
  parts.push(paintGeometry(lowerShield, M4_ALU_HEATSHIELD));

  // Bottom 6-o'clock MIL-STD-1913 Picatinny Rail + 11 Cross-Lugs
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(length, 0.12, 0.78).translate(0, -0.88, 0),
      M4_ANODIZED_CHARCOAL
    )
  );
  for (let i = 0; i < 11; i++) {
    const lx = -3.75 + i * 0.75;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.42, 0.14, 0.96).translate(lx, -0.98, 0),
        M4_ANODIZED_CHARCOAL
      )
    );
  }

  return mergeParts(parts);
}
