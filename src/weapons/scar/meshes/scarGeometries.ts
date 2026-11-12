import * as THREE from 'three';
import {
  clampUv01 as clamp01,
  fractPos,
  sampleTriangleInfo as triInfo,
} from '../../../engine/geometry/uvUnwrap';
import {
  createHelicalSpring,
  csgSubtract,
  csgUnion,
  finalizeGeometry,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';

// Belgian "50 Shades of FDE" & Hardware Vertex Palette
export const SCAR_FDE_CHAMPAGNE = '#a78b62'; // Anodized extruded aluminum upper
export const SCAR_FDE_RAIL_LUG = '#b69a70'; // Highlighted top M1913 dovetail cross-lugs
export const SCAR_FDE_RAIL_SLOT = '#876e4b'; // Recessed top M1913 rail spine slots
export const SCAR_FDE_COYOTE = '#8f7654'; // Matte polymer lower receiver
export const SCAR_FDE_STOCK = '#9d835b'; // Warm mustard-tan Ugg-boot buttstock
export const SCAR_FDE_RISER = '#ad936c'; // Lighter sand-tan cheek riser
export const SCAR_FDE_GRIP = '#846c4b'; // Deep coyote-earth ergonomic pistol grip
export const SCAR_FDE_MAG = '#a2875e'; // Dry-film FDE tan STANAG magazine
export const SCAR_DARK_STEEL = '#485262'; // Parkerized/nitride steel barrel, sights, BCG & hardware
export const SCAR_RAIL_BEVEL = '#566376'; // Machined M1913 cross-lug bevels & knurled sight drums
export const SCAR_INNER_DARK = '#262c36'; // Recessed rail slots, bores & ports
export const SCAR_POLYMER_DARK = '#323741'; // Matte dark polymer selector levers, deflector & caps
export const SCAR_BRIGHT_STEEL = '#d6dfe9';
export const SCAR_RUBBER_BLACK = '#23272f'; // Ribbed rubber recoil buttpad & impact bumpers
export const SCAR_SPRING_STEEL = '#94a3b8';

/**
 * Guarantees strictly unit-length vertex normals, finite attributes, and up-to-date bounds
 * without modifying custom UV atlas coordinates.
 */
export function sanitizeScarGeometry(
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
 * Builds a MIL-STD-1913 beveled dovetail Picatinny rail lug along X.
 */
export function createScarM1913Profile(
  lengthX: number,
  topWidthZ = 0.94,
  neckWidthZ = 0.72,
  heightY = 0.14
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
 * Unwraps U-01 Monolithic Extruded Aluminum Upper Receiver onto Band A (v in [0.69, 0.99])
 * of 2048x2048 scar_fde_{albedo,normal,roughness}.webp:
 *  - Left wall (fnz < -0.35): v in [0.84, 0.985] (FN HERSTAL BELGIUM SCAR-L CAL. 5.56MM + T-marks)
 *  - Right wall (fnz > 0.35): v in [0.69, 0.835] (T-marks + brass kiss + NATO proof)
 *  - Dark steel screws / inner cavity: Band E (v in [0.02, 0.09])
 */
export function applyScarUpperUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, cb, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    const isDarkHardware = cr < 0.12 || cr < cb * 1.15;

    let mode: 'hardware' | 'left' | 'right' | 'top' = 'top';
    if (isDarkHardware) {
      mode = 'hardware';
    } else if (fnz < -0.38 && cz < -0.35) {
      mode = 'left';
    } else if (fnz > 0.38 && cz > 0.35) {
      mode = 'right';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - -6.4) / 20.0);
      const yNorm = clamp01((y - 0.15) / 2.98);

      let u: number;
      let v: number;
      if (mode === 'hardware') {
        u = 0.38 + fractPos((x + z) * 0.18) * 0.24;
        v = 0.02 + fractPos(y * 0.22) * 0.07;
      } else if (mode === 'left') {
        u = 0.02 + (1.0 - xNorm) * 0.96;
        v = 0.842 + yNorm * 0.145;
      } else if (mode === 'right') {
        u = 0.02 + xNorm * 0.96;
        v = 0.692 + yNorm * 0.145;
      } else {
        u = 0.04 + xNorm * 0.42;
        v = 0.855 + clamp01((z + 0.95) / 1.9) * 0.035;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return sanitizeScarGeometry(geo);
}

/**
 * Unwraps Polymer Lower Receiver onto Band B (v in [0.41, 0.66]) with Left & Right S/1/A selector marks!
 */
export function applyScarLowerUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, cb, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    const isDarkSteel = cr < 0.12 || cr < cb * 1.15;

    let mode: 'steel' | 'left' | 'right' | 'rim' = 'rim';
    if (isDarkSteel) {
      mode = 'steel';
    } else if (fnz < -0.4 && cz < -0.32) {
      mode = 'left';
    } else if (fnz > 0.4 && cz > 0.32) {
      mode = 'right';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - -5.65) / 10.6);
      const yNorm = clamp01((y - -2.35) / 2.73);

      let u: number;
      let v: number;
      if (mode === 'steel') {
        u = 0.38 + fractPos((x + z) * 0.2) * 0.24;
        v = 0.02 + fractPos(y * 0.2) * 0.07;
      } else if (mode === 'left') {
        u = 0.02 + (1.0 - xNorm) * 0.47;
        v = 0.41 + yNorm * 0.25;
      } else if (mode === 'right') {
        u = 0.51 + xNorm * 0.47;
        v = 0.41 + yNorm * 0.25;
      } else {
        u = 0.04 + xNorm * 0.25;
        v = 0.415 + clamp01((z + 0.85) / 1.7) * 0.06;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return sanitizeScarGeometry(geo);
}

/**
 * Unwraps "Ugg-Boot" Buttstock, Cheek Riser, Grip, or Ranger Floorplate onto dedicated "50 Shades of FDE" swatches!
 */
export function applyScarSwatchUVs(
  geo: THREE.BufferGeometry,
  uMin: number,
  uMax: number,
  vMin: number,
  vMax: number,
  scale = 0.08
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr, cb } = triInfo(pos, col, i, i + 1, i + 2);
    const isBrightSteel = cr > 0.52 && cb > 0.52;
    const isDarkHardware = !isBrightSteel && (cr < 0.1 || cr < cb * 1.12);

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (isBrightSteel) {
        u = 0.72 + fractPos((x + z) * 0.2) * 0.22;
        v = 0.02 + fractPos(y * 0.2) * 0.07;
      } else if (isDarkHardware) {
        u = 0.06 + fractPos((x + z) * 0.2) * 0.22;
        v = 0.02 + fractPos(y * 0.2) * 0.07;
      } else {
        u = uMin + fractPos((x + z * 0.5) * scale) * (uMax - uMin);
        v = vMin + fractPos(y * scale) * (vMax - vMin);
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return sanitizeScarGeometry(geo);
}

/**
 * Unwraps 30-Rd FDE Tan STANAG Magazine onto Band D (u in [0.56, 0.96], v in [0.12, 0.39])
 */
export function applyScarMagUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, cb, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    const isBrightLips = cr > 0.48 && cb > 0.48;
    const isSideFlank = Math.abs(fnz) > 0.35 && Math.abs(cz) > 0.2;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (isBrightLips) {
        u = 0.72 + fractPos((x + z) * 0.22) * 0.22;
        v = 0.02 + fractPos(y * 0.22) * 0.07;
      } else {
        const yNorm = clamp01((y - -7.6) / 10.15);
        const xNorm = clamp01((x - -1.45) / 3.6);
        if (isSideFlank) {
          u =
            fnz > 0
              ? 0.58 + xNorm * 0.36
              : 0.58 + (1.0 - xNorm) * 0.36;
          v = 0.125 + yNorm * 0.265;
        } else {
          u = 0.55 + clamp01((z + 0.65) / 1.3) * 0.03;
          v = 0.125 + yNorm * 0.265;
        }
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return sanitizeScarGeometry(geo);
}

// ==============================================================================
// 1. SLIDE / MONOLITHIC UPPER, PISTON & BOLT CARRIER GROUP (10 PARTS)
// ==============================================================================

/**
 * U-01: Iconic Monolithic Extruded Aluminum FDE Upper Receiver (assembledPos: [0, 0, 0])
 * w/ Full-Length Top M1913 Rail, 3/6/9 O'Clock Forend Rails, Side Relief Scallops & Torx Fasteners
 * Spans X ∈ [-6.40, +13.60], Y ∈ [+0.02, +3.12], Z ∈ [-0.98, +1.14]
 */
export function buildScarUpperReceiverGeometry(): THREE.BufferGeometry {
  // Extruded FN Herstal cross-section w/ beveled upper rail transition shoulders
  const rearSec = new THREE.Shape();
  rearSec.moveTo(-0.88, 0.35);
  rearSec.lineTo(-0.88, 2.52);
  rearSec.lineTo(-0.56, 2.86);
  rearSec.lineTo(0.56, 2.86);
  rearSec.lineTo(0.88, 2.52);
  rearSec.lineTo(0.88, 0.35);
  rearSec.closePath();

  const rearHull = new THREE.ExtrudeGeometry(rearSec, {
    depth: 12.0,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  rearHull.rotateY(Math.PI / 2);
  rearHull.translate(-6.4, 0, 0);
  paintGeometry(rearHull, SCAR_FDE_CHAMPAGNE);

  const forendSec = new THREE.Shape();
  forendSec.moveTo(-0.82, 0.24);
  forendSec.lineTo(-0.82, 2.52);
  forendSec.lineTo(-0.54, 2.86);
  forendSec.lineTo(0.54, 2.86);
  forendSec.lineTo(0.82, 2.52);
  forendSec.lineTo(0.82, 0.24);
  forendSec.closePath();

  const forendHull = new THREE.ExtrudeGeometry(forendSec, {
    depth: 8.1,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  forendHull.rotateY(Math.PI / 2);
  forendHull.translate(5.5, 0, 0);
  paintGeometry(forendHull, SCAR_FDE_CHAMPAGNE);

  const rawMonolith = csgUnion([rearHull, forendHull]);

  // Cutters: internal BCG/barrel raceway, bottom FCG/magwell opening, ejection port, CH tracks, side scallops & vents!
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.BoxGeometry(20.4, 2.16, 1.36).translate(3.6, 1.48, 0),
      SCAR_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(10.05, 0.56, 1.34).translate(-0.58, 0.35, 0),
      SCAR_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(3.26, 0.9, 0.68).translate(2.2, 1.23, 0.68),
      SCAR_INNER_DARK
    ),
    // Ambidextrous reciprocating charging-handle tracks + rear keyway extraction circle
    paintGeometry(
      new THREE.BoxGeometry(6.8, 0.28, 2.12).translate(1.05, 2.12, 0),
      SCAR_INNER_DARK
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.24, 0.24, 2.12, 18)
        .rotateX(Math.PI / 2)
        .translate(-1.95, 2.12, 0),
      SCAR_INNER_DARK
    ),
    // Machined longitudinal side relief flutes along upper extruded walls (X ∈ [-5.6, +4.8])
    paintGeometry(
      new THREE.BoxGeometry(10.4, 0.18, 0.14).translate(-0.4, 2.44, 0.89),
      SCAR_FDE_CHAMPAGNE
    ),
    paintGeometry(
      new THREE.BoxGeometry(10.4, 0.18, 0.14).translate(-0.4, 2.44, -0.89),
      SCAR_FDE_CHAMPAGNE
    ),
  ];

  // Recessed counterbore scallops around the 6 quick-change barrel Torx cross-bolts (X = 4.28, 5.10, 5.92)
  for (const bx of [4.28, 5.1, 5.92]) {
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.26, 0.26, 0.22, 16)
          .rotateX(Math.PI / 2)
          .translate(bx, 0.7, 0.86),
        SCAR_FDE_CHAMPAGNE
      ),
      paintGeometry(
        new THREE.CylinderGeometry(0.26, 0.26, 0.22, 16)
          .rotateX(Math.PI / 2)
          .translate(bx, 0.7, -0.86),
        SCAR_FDE_CHAMPAGNE
      )
    );
  }

  // Forend dual-row stadium cooling vents (4 upper exposing gas piston + 4 lower exposing CHF barrel)
  for (const vx of [6.95, 8.75, 10.55, 12.35]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.18, 0.32, 2.05).translate(vx, 2.08, 0),
        SCAR_INNER_DARK
      ),
      paintGeometry(
        new THREE.BoxGeometry(1.18, 0.3, 2.05).translate(vx, 0.62, 0),
        SCAR_INNER_DARK
      )
    );
  }

  const carvedUpper = csgSubtract(rawMonolith, cutters);
  const parts: THREE.BufferGeometry[] = [carvedUpper];

  // Uninterrupted Full-Length Top MIL-STD-1913 Beveled Picatinny Rail (X ∈ [-6.32, +13.54], 26 Dovetail Lugs)
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(19.86, 0.11, 0.72).translate(3.61, 2.91, 0),
      SCAR_FDE_RAIL_SLOT
    )
  );
  for (let i = 0; i < 26; i++) {
    const lx = -5.95 + i * 0.765;
    parts.push(
      paintGeometry(
        createScarM1913Profile(0.42, 0.94, 0.72, 0.15).translate(lx, 2.96, 0),
        SCAR_FDE_RAIL_LUG
      )
    );
  }

  // Left & Right 3/9 o'clock Forend Picatinny Rails w/ Beveled Lugs & Torx T-Bolt Fasteners
  for (const side of [-1, 1]) {
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(7.25, 0.68, 0.11).translate(
          9.75,
          1.34,
          side * 0.85
        ),
        SCAR_INNER_DARK
      )
    );
    for (let i = 0; i < 9; i++) {
      const rx = 6.55 + i * 0.8;
      parts.push(
        paintGeometry(
          createScarM1913Profile(0.42, 0.72, 0.56, 0.13)
            .rotateX((side * Math.PI) / 2)
            .translate(rx, 1.34, side * 0.89),
          SCAR_RAIL_BEVEL
        )
      );
    }
    // Front & rear Torx rail retention bolts on 3/9 o'clock rails
    for (const tx of [6.3, 13.2]) {
      parts.push(
        paintGeometry(
          new THREE.CylinderGeometry(0.11, 0.11, 0.12, 12)
            .rotateX(Math.PI / 2)
            .translate(tx, 1.34, side * 0.96),
          SCAR_DARK_STEEL
        )
      );
    }
  }

  // Bottom 6 o'clock Forend Beveled Picatinny Rail (X ∈ [+5.75, +13.45], 10 Lugs) + Torx Fastener Bosses
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(7.7, 0.11, 0.72).translate(9.6, 0.19, 0),
      SCAR_INNER_DARK
    )
  );
  for (let i = 0; i < 10; i++) {
    const bx = 6.15 + i * 0.77;
    parts.push(
      paintGeometry(
        createScarM1913Profile(0.42, 0.92, 0.72, 0.13)
          .rotateX(Math.PI)
          .translate(bx, 0.14, 0),
        SCAR_RAIL_BEVEL
      )
    );
  }

  // Signature SCAR Angled Polymer Brass Deflector + Folded-Stock Retention Catch behind Right Ejection Port
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.78, 0.88, 0.28)
        .rotateY(-0.34)
        .translate(0.12, 1.24, 0.94),
      SCAR_POLYMER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.24, 0.36, 0.14).translate(-0.24, 1.24, 1.04),
      SCAR_DARK_STEEL
    )
  );

  // Iconic FN SCAR Front Left & Right Nose Sling Attachment Loops (X = +13.32, Y = 2.38, Z = ±0.90)
  for (const side of [-1, 1]) {
    parts.push(
      paintGeometry(
        new THREE.TorusGeometry(0.18, 0.045, 8, 16)
          .rotateY(Math.PI / 2)
          .translate(13.32, 2.38, side * 0.88),
        SCAR_DARK_STEEL
      )
    );
  }

  // Drilled Lower-Receiver Mating Pivot & Takedown Lugs extending down to Y = +0.18
  for (const lx of [4.65, -5.2]) {
    const lugRaw = paintGeometry(
      new THREE.BoxGeometry(0.95, 0.34, 0.78).translate(lx, 0.28, 0),
      SCAR_FDE_CHAMPAGNE
    );
    const pinBore = paintGeometry(
      new THREE.CylinderGeometry(0.165, 0.165, 0.96, 14)
        .rotateX(Math.PI / 2)
        .translate(lx, 0.14, 0),
      SCAR_DARK_STEEL
    );
    parts.push(csgSubtract(lugRaw, [pinBore]));
  }

  return applyScarUpperUVs(mergeParts(parts));
}

/**
 * U-02: Folding FN / KAC Micro Diopter Rear Sight w/ Elevation Cam & Windage Drum
 * (assembledPos: [-5.15, 3.12, 0] — aperture centered at Y_world = 3.74 co-witnessing Hooded Front Sight!)
 */
export function buildScarRearSightGeometry(): THREE.BufferGeometry {
  const railClampRaw = paintGeometry(
    new THREE.BoxGeometry(1.46, 0.28, 1.06).translate(0, 0.06, 0),
    SCAR_DARK_STEEL
  );
  const railDovetail = paintGeometry(
    new THREE.BoxGeometry(1.56, 0.12, 0.76).translate(0, -0.05, 0),
    SCAR_INNER_DARK
  );
  const railClamp = csgSubtract(railClampRaw, [railDovetail]);

  const crossBolt = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 1.28, 16)
      .rotateX(Math.PI / 2)
      .translate(0.18, 0.07, 0),
    SCAR_BRIGHT_STEEL
  );
  const releaseButton = paintGeometry(
    new THREE.CylinderGeometry(0.1, 0.1, 0.18, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.38, 0.12, -0.56),
    SCAR_BRIGHT_STEEL
  );
  // 200-600m Rotary Elevation Cam Drum at base of sight stem
  const elevDrum = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.2, 20).translate(-0.18, 0.24, 0),
    SCAR_RAIL_BEVEL
  );
  const towerStem = paintGeometry(
    new THREE.BoxGeometry(0.38, 0.52, 0.48).translate(-0.18, 0.44, 0),
    SCAR_DARK_STEEL
  );
  // Flip Dual-Aperture Diopter Peep Ring + Secondary Precision Leaf
  const ringOuter = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.28, 0.16, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.18, 0.62, 0),
    SCAR_DARK_STEEL
  );
  const peepHole = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 0.36, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.18, 0.62, 0),
    SCAR_INNER_DARK
  );
  const diopter = csgSubtract(ringOuter, [peepHole]);
  const flipTab = paintGeometry(
    new THREE.BoxGeometry(0.26, 0.08, 0.24).translate(-0.02, 0.44, 0),
    SCAR_DARK_STEEL
  );

  // Protective Sight Ears & Knurled Right Micro Windage Drum
  const earL = paintGeometry(
    new THREE.BoxGeometry(0.34, 0.46, 0.09).translate(-0.18, 0.64, -0.34),
    SCAR_DARK_STEEL
  );
  const earR = paintGeometry(
    new THREE.BoxGeometry(0.34, 0.46, 0.09).translate(-0.18, 0.64, 0.34),
    SCAR_DARK_STEEL
  );
  const windageShaft = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 0.96, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.18, 0.34, 0.08),
    SCAR_BRIGHT_STEEL
  );
  const windageDrum = paintGeometry(
    new THREE.CylinderGeometry(0.2, 0.2, 0.26, 20)
      .rotateX(Math.PI / 2)
      .translate(-0.18, 0.34, 0.56),
    SCAR_RAIL_BEVEL
  );

  return sanitizeScarGeometry(
    mergeParts([
      railClamp,
      crossBolt,
      releaseButton,
      elevDrum,
      towerStem,
      diopter,
      flipTab,
      earL,
      earR,
      windageShaft,
      windageDrum,
    ])
  );
}

/**
 * U-03: SCAR Gas Block w/ Folding Hooded Front Sight, Detent Latch & 2-Pos Rotary Gas Regulator Plug
 * (assembledPos: [14.70, 1.05, 0] — rear face local X = -1.10 meets Upper Receiver X = +13.60 flush!)
 */
export function buildScarGasBlockGeometry(): THREE.BufferGeometry {
  const barrelClamp = paintGeometry(
    new THREE.CylinderGeometry(0.66, 0.66, 2.2, 26)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    SCAR_DARK_STEEL
  );
  const gasWeb = paintGeometry(
    new THREE.BoxGeometry(2.05, 1.25, 0.84).translate(-0.04, 0.56, 0),
    SCAR_DARK_STEEL
  );
  const gasCylinder = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.58, 2.32, 26)
      .rotateZ(Math.PI / 2)
      .translate(-0.02, 1.07, 0),
    SCAR_DARK_STEEL
  );
  const bottomLug = paintGeometry(
    new THREE.BoxGeometry(1.08, 0.42, 0.48).translate(0.08, -0.74, 0),
    SCAR_DARK_STEEL
  );
  const sightHinge = paintGeometry(
    new THREE.BoxGeometry(0.98, 0.62, 0.68).translate(-0.12, 1.78, 0),
    SCAR_DARK_STEEL
  );
  const sightTower = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.68, 0.48).translate(-0.12, 2.28, 0),
    SCAR_DARK_STEEL
  );
  // Iconic SCAR Full Circular Protective Front-Sight Hood centered at local Y = +2.69 (world Y = +3.74)
  const hoodOuter = paintGeometry(
    new THREE.CylinderGeometry(0.45, 0.45, 0.54, 26)
      .rotateZ(Math.PI / 2)
      .translate(-0.12, 2.69, 0),
    SCAR_DARK_STEEL
  );

  const solid = csgUnion([
    barrelClamp,
    gasWeb,
    gasCylinder,
    bottomLug,
    sightHinge,
    sightTower,
    hoodOuter,
  ]);

  const barrelHole = paintGeometry(
    new THREE.CylinderGeometry(0.49, 0.49, 2.6, 24)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    SCAR_INNER_DARK
  );
  const pistonSocket = paintGeometry(
    new THREE.CylinderGeometry(0.41, 0.41, 1.68, 22)
      .rotateZ(Math.PI / 2)
      .translate(-0.55, 1.07, 0),
    SCAR_INNER_DARK
  );
  const hoodHole = paintGeometry(
    new THREE.CylinderGeometry(0.35, 0.35, 0.76, 24)
      .rotateZ(Math.PI / 2)
      .translate(-0.12, 2.69, 0),
    SCAR_INNER_DARK
  );
  const carved = csgSubtract(solid, [barrelHole, pistonSocket, hoodHole]);

  // 2-Position Rotary Gas Regulator Plug w/ Cartridge-Rim Tool Slot, Grip Ears & Top Detent Plunger Latch
  const regPlugRaw = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.45, 0.78, 24)
      .rotateZ(Math.PI / 2)
      .translate(1.48, 1.07, 0),
    SCAR_BRIGHT_STEEL
  );
  const regToolSlot = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.11, 0.94).translate(1.86, 1.07, 0),
    SCAR_INNER_DARK
  );
  const regPlug = csgSubtract(regPlugRaw, [regToolSlot]);
  const regWings = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.94, 0.22).translate(1.72, 1.07, 0),
    SCAR_RAIL_BEVEL
  );
  const regDetentLatch = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.12, 0.18).translate(1.02, 1.66, 0),
    SCAR_BRIGHT_STEEL
  );

  // Elevation-adjustable Front Sight Post, Left Folding Lock Button, Side Sling Loop & Cross-Pins
  const sightPostCollar = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 0.08, 14).translate(-0.12, 2.4, 0),
    SCAR_BRIGHT_STEEL
  );
  const sightPost = paintGeometry(
    new THREE.CylinderGeometry(0.048, 0.062, 0.34, 12).translate(-0.12, 2.57, 0),
    SCAR_BRIGHT_STEEL
  );
  const foldReleaseBtn = paintGeometry(
    new THREE.CylinderGeometry(0.12, 0.12, 0.2, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.12, 1.82, -0.4),
    SCAR_BRIGHT_STEEL
  );
  const hingePin = paintGeometry(
    new THREE.CylinderGeometry(0.1, 0.1, 0.84, 14)
      .rotateX(Math.PI / 2)
      .translate(-0.12, 1.68, 0),
    SCAR_BRIGHT_STEEL
  );
  const sideSlingLoop = paintGeometry(
    new THREE.TorusGeometry(0.19, 0.045, 8, 16).translate(-0.08, 0.42, -0.52),
    SCAR_DARK_STEEL
  );
  const crossPin1 = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.96, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.52, -0.42, 0),
    SCAR_BRIGHT_STEEL
  );
  const crossPin2 = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.96, 12)
      .rotateX(Math.PI / 2)
      .translate(0.52, -0.42, 0),
    SCAR_BRIGHT_STEEL
  );

  return sanitizeScarGeometry(
    mergeParts([
      carved,
      regPlug,
      regWings,
      regDetentLatch,
      sightPostCollar,
      sightPost,
      foldReleaseBtn,
      hingePin,
      sideSlingLoop,
      crossPin1,
      crossPin2,
    ])
  );
}

/**
 * U-04: Stainless Short-Stroke Gas Piston Tappet w/ Obturation Rings & Wrench Flats
 * (assembledPos: [12.35, 2.12, 0] — spans local X ∈ [-2.50, +2.45] -> world X ∈ [+9.85, +14.80])
 */
export function buildScarGasPistonGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.0, -2.5),
    new THREE.Vector2(0.24, -2.5), // Hardened rear tappet striking face
    new THREE.Vector2(0.24, -0.35), // Ground tappet stem
    new THREE.Vector2(0.365, -0.25), // Travel-limiting stop flange collar
    new THREE.Vector2(0.365, 0.16),
    new THREE.Vector2(0.28, 0.24), // Mid waist w/ wrench flats
    new THREE.Vector2(0.28, 1.24),
    new THREE.Vector2(0.395, 1.3), // Obturation gas land 1
    new THREE.Vector2(0.395, 1.54),
    new THREE.Vector2(0.315, 1.58), // Labyrinth gas ring groove 1
    new THREE.Vector2(0.315, 1.7),
    new THREE.Vector2(0.395, 1.74), // Obturation gas land 2
    new THREE.Vector2(0.395, 1.98),
    new THREE.Vector2(0.315, 2.02), // Labyrinth gas ring groove 2
    new THREE.Vector2(0.315, 2.14),
    new THREE.Vector2(0.395, 2.18), // Front gas cup land 3
    new THREE.Vector2(0.395, 2.45),
    new THREE.Vector2(0.24, 2.45), // Cupped high-pressure front gas face
    new THREE.Vector2(0.18, 2.26),
    new THREE.Vector2(0.0, 2.24),
  ];
  const lathe = new THREE.LatheGeometry(pts, 28);
  lathe.rotateZ(-Math.PI / 2);
  paintGeometry(lathe, SCAR_BRIGHT_STEEL);

  // Carve cleaning wrench flats on mid-waist
  const flatL = paintGeometry(
    new THREE.BoxGeometry(0.48, 0.7, 0.14).translate(0.74, 0, -0.29),
    SCAR_DARK_STEEL
  );
  const flatR = paintGeometry(
    new THREE.BoxGeometry(0.48, 0.7, 0.14).translate(0.74, 0, 0.29),
    SCAR_DARK_STEEL
  );
  return sanitizeScarGeometry(csgSubtract(lathe, [flatL, flatR]));
}

/**
 * U-05: Heavy Square-Section SCAR Bolt Carrier w/ Helical Cam Track, CH Keyway & Piston-Anvil Tower
 * (assembledPos: [2.45, 1.58, 0] — anvil face at world X = +9.85, Y = +2.12 kisses short-stroke tappet!)
 */
export function buildScarBoltCarrierGeometry(): THREE.BufferGeometry {
  // Rear face at local X = -3.60 -> world X = -1.15; at -4.50 recoil reaches world X = -5.65 (flush w/ -5.67 buffer pad!)
  const mainBlock = paintGeometry(
    new THREE.BoxGeometry(5.6, 1.56, 1.26).translate(-0.8, -0.02, 0),
    SCAR_DARK_STEEL
  );
  // Stepped upper guide-rod spine & forward short-stroke tappet anvil tube
  const guideSpine = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 7.6, 22)
      .rotateZ(Math.PI / 2)
      .translate(0.25, 0.7, 0),
    SCAR_DARK_STEEL
  );
  const anvilTube = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.42, 5.55, 24)
      .rotateZ(Math.PI / 2)
      .translate(4.65, 0.54, 0),
    SCAR_DARK_STEEL
  );
  const anvilCap = paintGeometry(
    new THREE.CylinderGeometry(0.415, 0.415, 0.36, 24)
      .rotateZ(Math.PI / 2)
      .translate(7.24, 0.54, 0),
    SCAR_BRIGHT_STEEL
  );
  const rawCarrier = csgUnion([mainBlock, guideSpine, anvilTube]);

  const cutters: THREE.BufferGeometry[] = [
    // Bolt tail raceway bore (world Y = +1.05 -> local Y = -0.53)
    paintGeometry(
      new THREE.CylinderGeometry(0.44, 0.44, 4.4, 24)
        .rotateZ(Math.PI / 2)
        .translate(0.15, -0.53, 0),
      SCAR_INNER_DARK
    ),
    // Bottom rear hammer-cocking & magazine feed-lip slot
    paintGeometry(
      new THREE.BoxGeometry(4.1, 0.58, 0.56).translate(-1.75, -0.62, 0),
      SCAR_INNER_DARK
    ),
    // Right ejection port scallop
    paintGeometry(
      new THREE.BoxGeometry(2.48, 0.68, 0.46).translate(0.65, -0.32, 0.52),
      SCAR_INNER_DARK
    ),
    // Precision Helical Cam-Pin Slot driving 22.5° bolt lug unlock/relock!
    paintGeometry(
      new THREE.BoxGeometry(1.18, 0.38, 0.6)
        .rotateY(0.44)
        .translate(0.35, -0.02, 0.25),
      SCAR_INNER_DARK
    ),
    // Ambidextrous Reversible Charging-Handle Cross-Keyway at X_local = +1.65, Y_local = +0.54 (world [4.10, 2.12])!
    paintGeometry(
      new THREE.BoxGeometry(0.58, 0.26, 1.5).translate(1.65, 0.54, 0),
      SCAR_INNER_DARK
    ),
    // Top captive recoil-rod & recoil-spring blind tunnel at Y_local = +0.70 (world Y = +2.28),
    // bored forward to X_local = +4.80 into anvilTube so stationary scar_recoil_rod (worldX <= +2.29) clears on recoil!
    paintGeometry(
      new THREE.CylinderGeometry(0.28, 0.28, 8.55, 20)
        .rotateZ(Math.PI / 2)
        .translate(0.52, 0.7, 0),
      SCAR_INNER_DARK
    ),
    // Longitudinal extruded-receiver guide-way grooves & side mass-tuning lightening pockets
    paintGeometry(
      new THREE.BoxGeometry(5.8, 0.22, 0.16).translate(-0.8, 0.18, -0.62),
      SCAR_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(5.8, 0.22, 0.16).translate(-0.8, 0.18, 0.62),
      SCAR_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.3, 0.38, 0.12).translate(-2.05, -0.22, -0.62),
      SCAR_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(2.3, 0.38, 0.12).translate(-2.05, -0.22, 0.62),
      SCAR_INNER_DARK
    ),
    // Firing-pin retaining cross-pin bore
    paintGeometry(
      new THREE.CylinderGeometry(0.075, 0.075, 1.45, 12)
        .rotateX(Math.PI / 2)
        .translate(-0.72, -0.44, 0),
      SCAR_INNER_DARK
    ),
  ];

  const machinedCarrier = csgSubtract(rawCarrier, cutters);
  return sanitizeScarGeometry(mergeParts([machinedCarrier, anvilCap]));
}

/**
 * U-06: Reversible Side Reciprocating Knurled Charging Handle (assembledPos: [4.10, 2.12, 0])
 */
export function buildScarChargingHandleGeometry(): THREE.BufferGeometry {
  const keyTangRaw = paintGeometry(
    new THREE.BoxGeometry(0.54, 0.23, 1.48).translate(0, 0, 0.08),
    SCAR_DARK_STEEL
  );
  // Central arch clearance groove at Y_local = +0.16 (world Y = 2.28) so stationary scar_recoil_rod passes cleanly!
  const rodClearance = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.8, 16)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.16, 0),
    SCAR_INNER_DARK
  );
  const keyTang = csgSubtract(keyTangRaw, [rodClearance]);
  const detentBall = paintGeometry(
    new THREE.SphereGeometry(0.065, 10, 10).translate(0, 0.12, 0.56),
    SCAR_BRIGHT_STEEL
  );
  const neck = paintGeometry(
    new THREE.CylinderGeometry(0.155, 0.155, 0.44, 16)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 0.96),
    SCAR_DARK_STEEL
  );
  const knurledDrum = paintGeometry(
    new THREE.CylinderGeometry(0.245, 0.225, 0.68, 22)
      .rotateX(Math.PI / 2)
      .translate(0, 0, 1.48),
    SCAR_DARK_STEEL
  );
  const parts: THREE.BufferGeometry[] = [
    keyTang,
    detentBall,
    neck,
    knurledDrum,
  ];

  // 8 Longitudinal tactical grip ribs around SCAR charging handle drum
  for (let r = 0; r < 8; r++) {
    const ang = (r * Math.PI * 2) / 8;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.045, 0.045, 0.56)
          .rotateZ(ang)
          .translate(
            Math.cos(ang) * 0.235,
            Math.sin(ang) * 0.235,
            1.48
          ),
        SCAR_BRIGHT_STEEL
      )
    );
  }
  parts.push(
    paintGeometry(
      new THREE.TorusGeometry(0.215, 0.035, 10, 20).translate(0, 0, 1.8),
      SCAR_BRIGHT_STEEL
    )
  );

  return sanitizeScarGeometry(mergeParts(parts));
}

/**
 * U-07: 7-Lug SCAR Rotating Bolt Head w/ Wide Claw Extractor, Plunger Ejector & Cam Pin
 * (assembledPos: [2.95, 1.05, 0] — bolt face at local X = +1.50 -> world X = +4.45)
 */
export function buildScarBoltGeometry(): THREE.BufferGeometry {
  const boltStem = paintGeometry(
    new THREE.CylinderGeometry(0.325, 0.325, 2.58, 24)
      .rotateZ(Math.PI / 2)
      .translate(-0.08, 0, 0),
    SCAR_BRIGHT_STEEL
  );
  const boltCollar = paintGeometry(
    new THREE.CylinderGeometry(0.415, 0.415, 0.48, 24)
      .rotateZ(Math.PI / 2)
      .translate(0.95, 0, 0),
    SCAR_BRIGHT_STEEL
  );

  const parts: THREE.BufferGeometry[] = [boltStem, boltCollar];

  // 7 Heavy Radial SCAR Locking Lugs spaced at 45° (leaving slot 0 at +Z for the Claw Extractor!)
  for (let idx = 1; idx < 8; idx++) {
    const ang = (idx * Math.PI * 2) / 8;
    const ly = Math.sin(ang) * 0.43;
    const lz = Math.cos(ang) * 0.43;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.39, 0.165, 0.19)
          .rotateX(-ang)
          .translate(1.31, ly, lz),
        SCAR_BRIGHT_STEEL
      )
    );
  }

  // Slot 0 (Z = +0.42): Heavy SCAR/AR-18 Claw Extractor w/ Rim Hook & Extractor Pivot Pin
  parts.push(
    paintGeometry(
      new THREE.BoxGeometry(1.04, 0.2, 0.18).translate(0.98, 0, 0.42),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.14, 0.21, 0.12).translate(1.44, 0, 0.35),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.048, 0.048, 0.38, 10).translate(
        0.78,
        0,
        0.42
      ),
      SCAR_BRIGHT_STEEL
    ),
    // Vertical Rectangular-Head SCAR Cam Pin engaging carrier helical cam track
    paintGeometry(
      new THREE.CylinderGeometry(0.14, 0.14, 0.56, 16).translate(
        -0.22,
        0.46,
        0
      ),
      SCAR_DARK_STEEL
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.33, 0.2, 0.26).translate(-0.22, 0.74, 0),
      SCAR_DARK_STEEL
    )
  );

  const merged = mergeParts(parts);

  // Carve recessed cartridge rim face cup & central firing-pin aperture
  const faceCup = paintGeometry(
    new THREE.CylinderGeometry(0.275, 0.275, 0.16, 22)
      .rotateZ(Math.PI / 2)
      .translate(1.48, 0, 0),
    SCAR_INNER_DARK
  );
  const fpHole = paintGeometry(
    new THREE.CylinderGeometry(0.048, 0.048, 0.55, 12)
      .rotateZ(Math.PI / 2)
      .translate(1.32, 0, 0),
    SCAR_INNER_DARK
  );
  const carvedBolt = csgSubtract(merged, [faceCup, fpHole]);

  // Spring-Loaded Cylindrical Plunger Ejector on Bolt Face (opposite extractor at 5π/4)
  const ejAng = (5 * Math.PI) / 4;
  const ejectorPlunger = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 0.16, 12)
      .rotateZ(Math.PI / 2)
      .translate(1.44, Math.sin(ejAng) * 0.16, Math.cos(ejAng) * 0.16),
    SCAR_DARK_STEEL
  );

  return sanitizeScarGeometry(mergeParts([carvedBolt, ejectorPlunger]));
}

/**
 * U-08: Full-Length Stainless SCAR Firing Pin & Retaining Cross-Pin (assembledPos: [1.55, 1.05, 0])
 * Spans local X ∈ [-1.45, +2.88] -> world X ∈ [+0.10, +4.43]
 */
export function buildScarFiringPinGeometry(): THREE.BufferGeometry {
  const rearHead = paintGeometry(
    new THREE.CylinderGeometry(0.15, 0.15, 0.4, 18)
      .rotateZ(Math.PI / 2)
      .translate(-1.25, 0, 0),
    SCAR_BRIGHT_STEEL
  );
  const retainNeck = paintGeometry(
    new THREE.CylinderGeometry(0.095, 0.095, 0.34, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.92, 0, 0),
    SCAR_BRIGHT_STEEL
  );
  const stopCollar = paintGeometry(
    new THREE.CylinderGeometry(0.215, 0.215, 0.18, 20)
      .rotateZ(Math.PI / 2)
      .translate(-0.68, 0, 0),
    SCAR_BRIGHT_STEEL
  );
  const shaft = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.105, 2.75, 16)
      .rotateZ(Math.PI / 2)
      .translate(0.75, 0, 0),
    SCAR_BRIGHT_STEEL
  );
  const tip = paintGeometry(
    new THREE.CylinderGeometry(0.036, 0.084, 0.72, 16)
      .rotateZ(Math.PI / 2)
      .translate(2.48, 0, 0),
    SCAR_BRIGHT_STEEL
  );
  const tipHemisphere = paintGeometry(
    new THREE.SphereGeometry(0.036, 10, 10).translate(2.84, 0, 0),
    SCAR_BRIGHT_STEEL
  );
  const retainingPin = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 1.18, 12)
      .rotateX(Math.PI / 2)
      .translate(-0.88, 0.16, 0),
    SCAR_DARK_STEEL
  );
  return sanitizeScarGeometry(
    mergeParts([
      rearHead,
      retainNeck,
      stopCollar,
      shaft,
      tip,
      tipHemisphere,
      retainingPin,
    ])
  );
}

/**
 * U-09: Captive Recoil Guide Rod & Rear Receiver Backplate Buffer (assembledPos: [-6.15, 2.15, 0])
 */
export function buildScarRecoilRodGeometry(): THREE.BufferGeometry {
  const endPlate = paintGeometry(
    new THREE.BoxGeometry(0.54, 2.44, 1.68).translate(-0.04, -0.56, 0),
    SCAR_RUBBER_BLACK
  );
  const dovetailRibL = paintGeometry(
    new THREE.BoxGeometry(0.14, 2.38, 0.14).translate(-0.32, -0.56, -0.68),
    SCAR_DARK_STEEL
  );
  const dovetailRibR = paintGeometry(
    new THREE.BoxGeometry(0.14, 2.38, 0.14).translate(-0.32, -0.56, 0.68),
    SCAR_DARK_STEEL
  );
  const bufferPad = paintGeometry(
    new THREE.BoxGeometry(0.28, 1.52, 1.18).translate(0.34, -0.45, 0),
    SCAR_DARK_STEEL
  );
  const guideRod = paintGeometry(
    new THREE.CylinderGeometry(0.115, 0.115, 8.2, 18)
      .rotateZ(Math.PI / 2)
      .translate(4.3, 0.13, 0),
    SCAR_BRIGHT_STEEL
  );
  const frontStop = paintGeometry(
    new THREE.CylinderGeometry(0.215, 0.215, 0.18, 18)
      .rotateZ(Math.PI / 2)
      .translate(8.35, 0.13, 0),
    SCAR_DARK_STEEL
  );
  return sanitizeScarGeometry(
    mergeParts([
      endPlate,
      dovetailRibL,
      dovetailRibR,
      bufferPad,
      guideRod,
      frontStop,
    ])
  );
}

/**
 * U-10: Captive Helical Recoil Spring (assembledPos: [-1.85, 2.28, 0], spans local X ∈ [-4.00, +4.00])
 */
export function buildScarRecoilSpringGeometry(): THREE.BufferGeometry {
  const spring = createHelicalSpring({
    axis: 'x',
    start: -4.0,
    end: 4.0,
    centerY: 0,
    centerZ: 0,
    coilRadius: 0.23,
    wireRadius: 0.044,
    coils: 22,
    radialSegments: 8,
    tubularSegmentsPerCoil: 16,
  });
  return sanitizeScarGeometry(
    finalizeGeometry(paintGeometry(spring, SCAR_SPRING_STEEL))
  );
}

// ==============================================================================
// 2A. BARREL, 3-PRONG FLASH SUPPRESSOR & QUICK-CHANGE CROSS-BOLTS ('frame' front)
// ==============================================================================

/**
 * F-02: 14" CQC Cold-Hammer-Forged Chrome-Lined Quick-Change Barrel + 7-Lug Extension,
 * Dual Feed Ramps, 6-Groove 5.56mm Rifling & Recessed Muzzle Crown (assembledPos: [0, 1.05, 0])
 */
export function buildScarBarrelGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.24, 3.35),
    new THREE.Vector2(0.62, 3.35), // Barrel extension breech face
    new THREE.Vector2(0.62, 4.75),
    new THREE.Vector2(0.685, 4.78), // Barrel extension locating flange
    new THREE.Vector2(0.685, 5.05),
    new THREE.Vector2(0.585, 5.1), // Quick-change cross-bolt trunnion journal
    new THREE.Vector2(0.585, 6.45),
    new THREE.Vector2(0.455, 6.8), // Chamber step-down under free-float forend
    new THREE.Vector2(0.425, 13.55),
    new THREE.Vector2(0.488, 13.62), // SCAR gas-block journal
    new THREE.Vector2(0.488, 15.8),
    new THREE.Vector2(0.39, 15.88), // Forward 14" CQC contour
    new THREE.Vector2(0.39, 22.1),
    new THREE.Vector2(0.32, 22.12), // Threaded muzzle spigot inside 3-prong flash suppressor
    new THREE.Vector2(0.32, 22.85),
    new THREE.Vector2(0.168, 22.75), // Recessed 11° CHF muzzle crown!
  ];
  const outer = new THREE.LatheGeometry(pts, 32);
  outer.rotateZ(-Math.PI / 2);
  paintGeometry(outer, SCAR_DARK_STEEL);

  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.168, 0.168, 20.2, 20)
      .rotateZ(Math.PI / 2)
      .translate(13.2, 0, 0),
    SCAR_INNER_DARK
  );
  const chamber = paintGeometry(
    new THREE.CylinderGeometry(0.28, 0.31, 2.5, 20)
      .rotateZ(Math.PI / 2)
      .translate(4.65, 0, 0),
    SCAR_INNER_DARK
  );
  const rampL = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.16, 0.68, 12)
      .rotateZ(Math.PI / 2 - 0.32)
      .translate(3.58, -0.28, -0.14),
    SCAR_BRIGHT_STEEL
  );
  const rampR = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.16, 0.68, 12)
      .rotateZ(Math.PI / 2 - 0.32)
      .translate(3.58, -0.28, 0.14),
    SCAR_BRIGHT_STEEL
  );
  const hollowed = csgSubtract(outer, [bore, chamber, rampL, rampR]);

  const parts: THREE.BufferGeometry[] = [hollowed];

  // 6 Right-Hand 5.56mm (1:7") Chrome-Lined Rifling Lands inside Bore (X ∈ [6.0, 22.72])
  for (let r = 0; r < 6; r++) {
    const ang = (r * Math.PI * 2) / 6 + 0.18;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(16.72, 0.036, 0.044)
          .rotateX(-ang)
          .translate(
            14.36,
            Math.sin(ang) * 0.156,
            Math.cos(ang) * 0.156
          ),
        SCAR_BRIGHT_STEEL
      )
    );
  }

  // 7 Internal Barrel Extension Locking Lugs + Polished Chrome Breech Ring
  for (let k = 1; k <= 7; k++) {
    const ang = (k * Math.PI) / 4 + Math.PI / 8;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.38, 0.14, 0.16)
          .rotateX(-ang)
          .translate(3.62, Math.sin(ang) * 0.39, Math.cos(ang) * 0.39),
        SCAR_BRIGHT_STEEL
      )
    );
  }
  parts.push(
    paintGeometry(
      new THREE.TorusGeometry(0.38, 0.055, 10, 24)
        .rotateY(Math.PI / 2)
        .translate(3.38, 0, 0),
      SCAR_BRIGHT_STEEL
    )
  );

  return sanitizeScarGeometry(mergeParts(parts));
}

/**
 * F-03: Iconic FN SCAR / AAC Blackout 51T 3-Prong Open-Tine Flash Suppressor
 * (assembledPos: [22.95, 1.05, 0] — spans world X ∈ [+22.07, +24.50])
 */
export function buildScarFlashSuppressorGeometry(): THREE.BufferGeometry {
  const ratchetCollar = paintGeometry(
    new THREE.CylinderGeometry(0.54, 0.52, 0.72, 28)
      .rotateZ(Math.PI / 2)
      .translate(-0.52, 0, 0),
    SCAR_RAIL_BEVEL
  );
  const prongCylinder = paintGeometry(
    new THREE.CylinderGeometry(0.49, 0.515, 1.71, 28)
      .rotateZ(Math.PI / 2)
      .translate(0.695, 0, 0),
    SCAR_DARK_STEEL
  );
  const rawBody = csgUnion([ratchetCollar, prongCylinder]);

  const cutters: THREE.BufferGeometry[] = [
    // Tapered flash-suppressor cone bore
    paintGeometry(
      new THREE.CylinderGeometry(0.33, 0.25, 2.8, 24)
        .rotateZ(Math.PI / 2)
        .translate(0.35, 0, 0),
      SCAR_INNER_DARK
    ),
    // Rear wrench flats on suppressor mount shoulder
    paintGeometry(
      new THREE.BoxGeometry(0.28, 1.1, 0.16).translate(-0.68, 0, 0.54),
      SCAR_INNER_DARK
    ),
    paintGeometry(
      new THREE.BoxGeometry(0.28, 1.1, 0.16).translate(-0.68, 0, -0.54),
      SCAR_INNER_DARK
    ),
  ];

  // 3 Deep Open Longitudinal Tuning-Fork Prong Cutouts at 120° + Outer Tine Mass-Relief Flutes!
  for (let i = 0; i < 3; i++) {
    const ang = (i * Math.PI * 2) / 3 + Math.PI / 6;
    const cy = Math.sin(ang) * 0.35;
    const cz = Math.cos(ang) * 0.35;
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.52, 0.35, 0.37)
          .rotateX(-ang)
          .translate(0.88, cy, cz),
        SCAR_INNER_DARK
      )
    );
    const tineAng = ang + Math.PI / 3;
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.18, 0.12, 0.12)
          .rotateX(-tineAng)
          .translate(
            0.84,
            Math.sin(tineAng) * 0.51,
            Math.cos(tineAng) * 0.51
          ),
        SCAR_INNER_DARK
      )
    );
  }

  const threeProng = csgSubtract(rawBody, cutters);

  // 51T Quick-Detach Suppressor Ratchet Ring Teeth at X_local = -0.22
  const parts: THREE.BufferGeometry[] = [
    threeProng,
    paintGeometry(
      new THREE.TorusGeometry(0.545, 0.042, 10, 28)
        .rotateY(Math.PI / 2)
        .translate(-0.22, 0, 0),
      SCAR_BRIGHT_STEEL
    ),
  ];
  for (let t = 0; t < 18; t++) {
    const ang = (t * Math.PI * 2) / 18;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.11, 0.045, 0.05)
          .rotateX(-ang)
          .translate(-0.22, Math.sin(ang) * 0.555, Math.cos(ang) * 0.555),
        SCAR_BRIGHT_STEEL
      )
    );
  }

  return sanitizeScarGeometry(mergeParts(parts));
}

/**
 * F-04: Quick-Change Barrel Steel Trunnion Yoke & 6 Captive Torx T25 Retention Cross-Bolts
 * (assembledPos: [5.10, 0.92, 0])
 */
export function buildScarBarrelCrossboltsGeometry(): THREE.BufferGeometry {
  const yokeRaw = paintGeometry(
    new THREE.BoxGeometry(2.18, 0.96, 1.32).translate(0, -0.1, 0),
    SCAR_BRIGHT_STEEL
  );
  const barrelCut = paintGeometry(
    new THREE.CylinderGeometry(0.6, 0.6, 2.45, 24)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.13, 0),
    SCAR_INNER_DARK
  );
  const yoke = csgSubtract(yokeRaw, [barrelCut]);

  const parts: THREE.BufferGeometry[] = [yoke];
  for (const bx of [-0.82, 0.0, 0.82]) {
    parts.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.11, 0.11, 1.82, 16)
          .rotateX(Math.PI / 2)
          .translate(bx, -0.22, 0),
        SCAR_DARK_STEEL
      )
    );
    // Left & Right Captive Conical Washers + Recessed 6-Point Star Torx T25 Bolt Heads
    for (const side of [-1, 1]) {
      const headRaw = paintGeometry(
        new THREE.CylinderGeometry(0.2, 0.2, 0.11, 18)
          .rotateX(Math.PI / 2)
          .translate(bx, -0.22, side * 0.89),
        SCAR_DARK_STEEL
      );
      const torxStar = paintGeometry(
        new THREE.CylinderGeometry(0.085, 0.085, 0.1, 6)
          .rotateX(Math.PI / 2)
          .translate(bx, -0.22, side * 0.94),
        SCAR_INNER_DARK
      );
      const washer = paintGeometry(
        new THREE.CylinderGeometry(0.23, 0.23, 0.04, 18)
          .rotateX(Math.PI / 2)
          .translate(bx, -0.22, side * 0.83),
        SCAR_BRIGHT_STEEL
      );
      parts.push(washer, csgSubtract(headRaw, [torxStar]));
    }
  }

  return sanitizeScarGeometry(mergeParts(parts));
}
