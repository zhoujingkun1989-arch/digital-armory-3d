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
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import {
  buildP90BoltGeometry,
  buildP90FiringPinGeometry,
  buildP90GuideRodsGeometry,
  buildP90HammerGeometry,
  buildP90HammerPackGeometry,
  buildP90HelicalRampGeometry,
  buildP90MagBodyGeometry,
  buildP90MagFloorplateGeometry,
  buildP90MagFollowerGeometry,
  buildP90MagSpringGeometry,
  buildP90RecoilSpringsGeometry,
  buildP90SelectorGeometry,
  buildP90TransferBarsGeometry,
  buildP90TriggerGeometry,
} from './p90ExtraGeometries';

// Authentic FN Herstal P90 tactical palette (used when PBR toggled off & for UV island tagging)
export const P90_STOCK_BLACK = '#2f3540';
export const P90_STOCK_DARK = '#242932';
export const P90_UPPER_ALLOY = '#3d4654';
export const P90_DARK_STEEL = '#46505f';
export const P90_CHAMFER_STEEL = '#5a6678';
export const P90_INNER_DARK = '#232832';
export const P90_BRIGHT_STEEL = '#cbd5e1';
export const P90_CHROME_STEEL = '#e2e8f0';
export const P90_RUBBER_BUTT = '#232730';
export const P90_LENS_SAPPHIRE = '#0ea5c6';
export const P90_SPRING_STEEL = '#94a3b8';

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _fn = new THREE.Vector3();

/**
 * Strips any zero-area CSG sliver triangles, ensures non-indexed attributes,
 * enforces exact unit-length normals (|n| = 1) with zero NaN/Infinity, and updates bounds.
 */
export function sanitizeP90Mesh(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.getAttribute('position');
  const norm = src.getAttribute('normal');
  const uv = src.getAttribute('uv');
  const col = src.getAttribute('color');
  const vCount = pos.count;

  const validTris: number[] = [];
  for (let i = 0; i + 2 < vCount; i += 3) {
    _vA.fromBufferAttribute(pos, i);
    _vB.fromBufferAttribute(pos, i + 1);
    _vC.fromBufferAttribute(pos, i + 2);
    _e1.subVectors(_vB, _vA);
    _e2.subVectors(_vC, _vA);
    _fn.crossVectors(_e1, _e2);
    if (_fn.lengthSq() > 1e-16) {
      validTris.push(i);
    }
  }

  let out = src;
  if (validTris.length * 3 !== vCount) {
    const nV = validTris.length * 3;
    const pArr = new Float32Array(nV * 3);
    const nArr = new Float32Array(nV * 3);
    const uArr = new Float32Array(nV * 2);
    const cArr = new Float32Array(nV * 3);

    for (let t = 0; t < validTris.length; t++) {
      const base = validTris[t];
      for (let k = 0; k < 3; k++) {
        const si = base + k;
        const di = t * 3 + k;
        pArr[di * 3] = pos.getX(si);
        pArr[di * 3 + 1] = pos.getY(si);
        pArr[di * 3 + 2] = pos.getZ(si);

        nArr[di * 3] = norm ? norm.getX(si) : 0;
        nArr[di * 3 + 1] = norm ? norm.getY(si) : 1;
        nArr[di * 3 + 2] = norm ? norm.getZ(si) : 0;

        uArr[di * 2] = uv ? uv.getX(si) : 0;
        uArr[di * 2 + 1] = uv ? uv.getY(si) : 0;

        cArr[di * 3] = col ? col.getX(si) : 0.5;
        cArr[di * 3 + 1] = col ? col.getY(si) : 0.5;
        cArr[di * 3 + 2] = col ? col.getZ(si) : 0.5;
      }
    }
    out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nArr, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uArr, 2));
    out.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
    if (src !== geo) src.dispose();
    geo.dispose();
  } else if (src !== geo) {
    geo.dispose();
  }

  const outPos = out.getAttribute('position');
  const outNorm = out.getAttribute('normal');
  const nTotal = outPos.count;
  for (let i = 0; i + 2 < nTotal; i += 3) {
    let needFace = false;
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const nx = outNorm.getX(vi);
      const ny = outNorm.getY(vi);
      const nz = outNorm.getZ(vi);
      const len = Math.hypot(nx, ny, nz);
      if (!Number.isFinite(len) || len < 1e-5) {
        needFace = true;
      } else {
        outNorm.setXYZ(vi, nx / len, ny / len, nz / len);
      }
    }
    if (needFace) {
      _vA.fromBufferAttribute(outPos, i);
      _vB.fromBufferAttribute(outPos, i + 1);
      _vC.fromBufferAttribute(outPos, i + 2);
      _e1.subVectors(_vB, _vA);
      _e2.subVectors(_vC, _vA);
      _fn.crossVectors(_e1, _e2);
      const fl = _fn.length();
      if (fl > 1e-8) _fn.divideScalar(fl);
      else _fn.set(0, 1, 0);
      for (let k = 0; k < 3; k++) {
        outNorm.setXYZ(i + k, _fn.x, _fn.y, _fn.z);
      }
    }
  }

  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

// ============================================================================
// 1. PRECISION 2K UV ATLAS UNWRAPPERS (`p90_stock_*` & `p90_mag_*`)
// ============================================================================

/**
 * Unwraps F-01 Polymer Thumbhole Bullpup Stock onto bottom half of `p90_stock_*` (2048×1024):
 *  - Left flank  (v ∈ [0.06, 0.30], u ∈ [0.03, 0.97]): FN HERSTAL BELGIUM + P90 CAL 5.7×28 + EDM stipple
 *  - Right flank (v ∈ [0.32, 0.56], u ∈ [0.03, 0.97]): FN084912 serial + Liège proof + EDM stipple
 *  - Inner/top/bottom walls: v ∈ [0.01, 0.05], u ∈ [0.03, 0.72]
 */
export function applyP90StockUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    let mode: 'right' | 'left' | 'inner' = 'inner';
    if (fnz > 0.36 && cz > 0.25) {
      mode = 'right';
    } else if (fnz < -0.36 && cz < -0.25) {
      mode = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - -16.2) / 30.8);
      const yNorm = clamp01((y - -8.25) / 10.2);

      let u: number;
      let v: number;
      if (mode === 'right') {
        u = 0.03 + xNorm * 0.94;
        v = 0.32 + yNorm * 0.24;
      } else if (mode === 'left') {
        u = 0.03 + (1.0 - xNorm) * 0.94;
        v = 0.06 + yNorm * 0.24;
      } else {
        u = 0.03 + xNorm * 0.68;
        v = 0.01 + clamp01((z + 1.15) / 2.3) * 0.04;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps U-01 Modular Alloy Optical Upper Receiver onto upper-mid strip of `p90_stock_*`:
 *  - Anodized walls: u ∈ [0.04, 0.74], v ∈ [0.60, 0.78]
 *  - Bright CNC rail/steel chamfers: u ∈ [0.78, 0.97], v ∈ [0.60, 0.76]
 */
export function applyP90UpperReceiverUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr } = triInfo(pos, col, i, i + 1, i + 2);
    const isBright = cr > 0.35;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - 1.75) / 13.5);
      const yNorm = clamp01((y - 0.15) / 5.6);

      let u: number;
      let v: number;
      if (isBright) {
        u = 0.78 + fractPos((x + z) * 0.28) * 0.18;
        v = 0.6 + yNorm * 0.16;
      } else {
        u = 0.04 + xNorm * 0.7;
        v = 0.6 + yNorm * 0.18;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps U-04 Ring Sight MC-10-80 Optical Sight onto top strip of `p90_stock_*`:
 *  - Cast anodized sight housing: u ∈ [0.04, 0.74], v ∈ [0.80, 0.97]
 *  - Sapphire-cyan multi-coated lenses: u ∈ [0.78, 0.97], v ∈ [0.80, 0.97]
 */
export function applyP90RingSightUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr, cb } = triInfo(pos, col, i, i + 1, i + 2);
    const isLens = cb > cr + 0.12;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (isLens) {
        u = 0.79 + clamp01((z + 0.55) / 1.1) * 0.17;
        v = 0.81 + clamp01((y + 0.65) / 1.3) * 0.15;
      } else {
        u = 0.04 + clamp01((x + 2.45) / 4.9) * 0.7;
        v = 0.8 + clamp01((y + 0.78) / 1.56) * 0.17;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps M-01 50-Rd Smoked Translucent Polycarbonate Magazine onto `p90_mag_*` (2048×1024):
 *  - Top horizontal window (`ny > 0.42`): u ∈ [0.04, 0.96], v ∈ [0.56, 0.96]
 *    (reveals 50 sideways 5.7×28mm cartridges + 50 / 25 / 10 witness indices!)
 *  - Left & right polycarbonate flanks: u ∈ [0.04, 0.96], v ∈ [0.34, 0.54]
 */
export function applyP90MagBodyUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { fny } = triInfo(pos, col, i, i + 1, i + 2);
    const isTopOrBottom = Math.abs(fny) > 0.45;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x + 10.45) / 20.9);
      const zNorm = clamp01((z + 1.3) / 2.6);
      const yNorm = clamp01((y + 0.74) / 1.48);

      let u: number;
      let v: number;
      if (isTopOrBottom) {
        u = 0.04 + xNorm * 0.92;
        v = 0.56 + (1.0 - zNorm) * 0.4;
      } else {
        u = 0.04 + xNorm * 0.92;
        v = 0.34 + yNorm * 0.2;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps M-02 90° Helical Feed Ramp Turret onto bottom strip of `p90_mag_*`:
 *  - Polymer spiral turret & brass wear track: u ∈ [0.04, 0.68], v ∈ [0.04, 0.30]
 *  - Hardened steel feed-lip inserts & spiral guide rails: u ∈ [0.72, 0.96], v ∈ [0.04, 0.30]
 */
export function applyP90HelicalRampUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cr } = triInfo(pos, col, i, i + 1, i + 2);
    const isMetal = cr > 0.42;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x + 1.4) / 2.8);
      const yNorm = clamp01((y + 0.78) / 1.56);

      let u: number;
      let v: number;
      if (isMetal) {
        u = 0.72 + fractPos((x + z) * 0.4) * 0.24;
        v = 0.04 + yNorm * 0.26;
      } else {
        u = 0.04 + xNorm * 0.64;
        v = 0.04 + yNorm * 0.26;
      }
      uvs[vi * 2] = clamp01(u);
      uvs[vi * 2 + 1] = clamp01(v);
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

// ============================================================================
// 2. UPPER OPTICAL RECEIVER, CHF BARREL & RING SIGHT ('slide' U-01..U-05)
// ============================================================================

/**
 * U-01: Modular Die-Cast / Extruded Alloy Upper Receiver & Optical Bridge
 * (assembledPos: [0, 0, 0], isShell: true)
 * Spans X ∈ [1.80, 15.15], Y ∈ [0.18, 5.72], Z ∈ [-1.06, +1.06].
 * Features:
 *  - Lower barrel & non-reciprocating charging shroud (Y ∈ [0.18, 2.02])
 *  - Rear under-bridge socket (X ∈ [1.80, 6.72], Y ∈ [1.92, 3.42]) cradling the nose of the 50-rd mag!
 *  - Swept forward P90 optical sight arch w/ central MC-10-80 sight window (X ∈ [7.15, 12.35])
 *  - Integral top emergency backup iron sight channel & right-side MIL-STD-1913 Picatinny rail
 */
export function buildP90UpperReceiverGeometry(): THREE.BufferGeometry {
  const archShape = new THREE.Shape();
  archShape.moveTo(1.8, 0.18);
  archShape.lineTo(15.15, 0.18);
  archShape.lineTo(15.15, 1.92);
  archShape.lineTo(14.35, 3.35);
  archShape.quadraticCurveTo(13.65, 5.55, 12.55, 5.68);
  archShape.lineTo(7.45, 5.68);
  archShape.quadraticCurveTo(6.65, 5.55, 6.45, 3.55);
  archShape.lineTo(6.68, 3.44);
  archShape.lineTo(6.68, 1.92);
  archShape.lineTo(1.8, 1.92);
  archShape.closePath();

  const receiverRaw = new THREE.ExtrudeGeometry(archShape, {
    depth: 1.96,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  receiverRaw.translate(0, 0, -0.98);
  paintGeometry(receiverRaw, P90_UPPER_ALLOY);

  // Subtract bore shroud tunnel, central Ring Sight window, top iron-sight trough & charging slots
  const boreTunnel = paintGeometry(
    new THREE.CylinderGeometry(0.62, 0.62, 13.8, 24)
      .rotateZ(Math.PI / 2)
      .translate(8.5, 0.85, 0),
    P90_INNER_DARK
  );
  const opticWindow = paintGeometry(
    new THREE.BoxGeometry(5.1, 1.66, 2.4).translate(9.65, 4.32, 0),
    P90_INNER_DARK
  );
  const opticAxialPort = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.56, 9.2, 22)
      .rotateZ(Math.PI / 2)
      .translate(10.2, 4.32, 0),
    P90_INNER_DARK
  );
  const backupSightChannel = paintGeometry(
    new THREE.BoxGeometry(5.6, 0.34, 0.56).translate(9.95, 5.62, 0),
    P90_INNER_DARK
  );
  const chargingSlotL = paintGeometry(
    new THREE.BoxGeometry(6.8, 0.34, 0.45).translate(9.45, 1.48, -0.95),
    P90_INNER_DARK
  );
  const chargingSlotR = paintGeometry(
    new THREE.BoxGeometry(6.8, 0.34, 0.45).translate(9.45, 1.48, 0.95),
    P90_INNER_DARK
  );

  const hollowedReceiver = csgSubtract(receiverRaw, [
    boreTunnel,
    opticWindow,
    opticAxialPort,
    backupSightChannel,
    chargingSlotL,
    chargingSlotR,
  ]);

  // Right-flank MIL-STD-1913 Picatinny accessory rail & top backup sight blades
  const railParts: THREE.BufferGeometry[] = [hollowedReceiver];
  const sideRailBase = paintGeometry(
    new THREE.BoxGeometry(4.6, 0.46, 0.24).translate(10.4, 4.32, 1.08),
    P90_DARK_STEEL
  );
  railParts.push(sideRailBase);
  for (let i = 0; i < 6; i++) {
    const rx = 8.45 + i * 0.78;
    railParts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.42, 0.54, 0.18).translate(rx, 4.32, 1.2),
        P90_BRIGHT_STEEL
      )
    );
  }
  // Rear takedown locking lug underneath receiver heel (mates w/ F-03 plunger at X = 1.55)
  railParts.push(
    paintGeometry(
      new THREE.BoxGeometry(0.75, 0.38, 0.84).translate(2.18, 0.04, 0),
      P90_CHAMFER_STEEL
    )
  );

  return sanitizeP90Mesh(applyP90UpperReceiverUVs(mergeParts(railParts)));
}

/**
 * U-02: 10.4-Inch (264mm) Cold-Hammer-Forged Chrome-Lined 5.7×28mm Barrel
 * (assembledPos: [0, 0.85, 0]) — Fixed barrel w/ 6-groove rifling & bottleneck chamber!
 */
export function buildP90BarrelGeometry(): THREE.BufferGeometry {
  const chamberBlock = paintGeometry(
    new THREE.CylinderGeometry(0.56, 0.58, 4.4, 28)
      .rotateZ(Math.PI / 2)
      .translate(-0.35, 0, 0),
    P90_DARK_STEEL
  );
  const trunnionCollar = paintGeometry(
    new THREE.BoxGeometry(1.45, 1.08, 1.08).translate(2.55, 0, 0),
    P90_CHAMFER_STEEL
  );
  const mainTube = paintGeometry(
    new THREE.CylinderGeometry(0.38, 0.42, 11.55, 28)
      .rotateZ(Math.PI / 2)
      .translate(9.05, 0, 0),
    P90_DARK_STEEL
  );
  const muzzleTenon = paintGeometry(
    new THREE.CylinderGeometry(0.3, 0.3, 0.65, 24)
      .rotateZ(Math.PI / 2)
      .translate(15.05, 0, 0),
    P90_BRIGHT_STEEL
  );
  const outerBarrel = csgUnion([
    chamberBlock,
    trunnionCollar,
    mainTube,
    muzzleTenon,
  ]);

  // Subtract 5.7mm chrome-lined bore, 6 rifling grooves & 5.7×28mm bottleneck chamber
  const cutters: THREE.BufferGeometry[] = [
    paintGeometry(
      new THREE.CylinderGeometry(0.16, 0.16, 18.4, 22)
        .rotateZ(Math.PI / 2)
        .translate(6.4, 0, 0),
      P90_BRIGHT_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.27, 0.28, 1.95, 22)
        .rotateZ(Math.PI / 2)
        .translate(-1.58, 0, 0),
      P90_CHROME_STEEL
    ),
    paintGeometry(
      new THREE.CylinderGeometry(0.17, 0.27, 0.36, 20)
        .rotateZ(Math.PI / 2)
        .translate(-0.42, 0, 0),
      P90_CHROME_STEEL
    ),
  ];
  for (let g = 0; g < 6; g++) {
    const ang = (g / 6) * Math.PI * 2;
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(15.6, 0.045, 0.045)
          .rotateX(ang)
          .translate(7.4, Math.cos(ang) * 0.165, Math.sin(ang) * 0.165),
        P90_CHROME_STEEL
      )
    );
  }

  return sanitizeP90Mesh(csgSubtract(outerBarrel, cutters));
}

/**
 * U-03: Iconic FN P90 Slanted Birdcage Flash Suppressor / Recoil Compensator
 * (assembledPos: [15.85, 0.85, 0]) — Spans world X ∈ [15.05, 16.80].
 */
export function buildP90FlashHiderGeometry(): THREE.BufferGeometry {
  const body = paintGeometry(
    new THREE.CylinderGeometry(0.43, 0.43, 1.78, 28)
      .rotateZ(Math.PI / 2)
      .translate(0.08, 0, 0),
    P90_DARK_STEEL
  );
  const rearWrenchCollar = paintGeometry(
    new THREE.BoxGeometry(0.36, 0.78, 0.78).translate(-0.62, 0, 0),
    P90_CHAMFER_STEEL
  );
  const rawHider = csgUnion([body, rearWrenchCollar]);

  // 32° downward-slanted front compensator face + central bore + 4 radial flash slots
  const slantCut = paintGeometry(
    new THREE.BoxGeometry(1.2, 1.6, 1.4)
      .rotateZ(-0.56)
      .translate(1.26, -0.25, 0),
    P90_INNER_DARK
  );
  const centerBore = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 2.4, 22)
      .rotateZ(Math.PI / 2)
      .translate(0.1, 0, 0),
    P90_INNER_DARK
  );
  const slotHoriz = paintGeometry(
    new THREE.BoxGeometry(0.76, 0.16, 1.15).translate(0.18, 0.12, 0),
    P90_INNER_DARK
  );
  const slotUpper = paintGeometry(
    new THREE.BoxGeometry(0.76, 0.65, 0.16).translate(0.18, 0.32, 0),
    P90_INNER_DARK
  );

  return sanitizeP90Mesh(
    csgSubtract(rawHider, [slantCut, centerBore, slotHoriz, slotUpper])
  );
}

/**
 * U-04: FN Ring Sight MC-10-80 Reflex Optical Collimator Sight (assembledPos: [9.60, 4.32, 0])
 */
export function buildP90RingSightGeometry(): THREE.BufferGeometry {
  const mainTube = paintGeometry(
    new THREE.CylinderGeometry(0.58, 0.62, 4.55, 26).rotateZ(Math.PI / 2),
    P90_UPPER_ALLOY
  );
  const mountingFoot = paintGeometry(
    new THREE.BoxGeometry(3.85, 0.44, 0.92).translate(-0.08, -0.58, 0),
    P90_DARK_STEEL
  );
  const collectorPrism = paintGeometry(
    new THREE.BoxGeometry(1.45, 0.28, 0.62).translate(1.15, 0.56, 0),
    P90_CHAMFER_STEEL
  );
  const rawHousing = csgUnion([mainTube, mountingFoot, collectorPrism]);

  const frontCup = paintGeometry(
    new THREE.CylinderGeometry(0.46, 0.46, 0.34, 24)
      .rotateZ(Math.PI / 2)
      .translate(2.2, 0, 0),
    P90_INNER_DARK
  );
  const rearCup = paintGeometry(
    new THREE.CylinderGeometry(0.44, 0.44, 0.34, 24)
      .rotateZ(Math.PI / 2)
      .translate(-2.2, 0, 0),
    P90_INNER_DARK
  );
  const hollowedOptic = csgSubtract(rawHousing, [frontCup, rearCup]);

  const objectiveLens = paintGeometry(
    new THREE.CylinderGeometry(0.44, 0.44, 0.08, 24)
      .rotateZ(Math.PI / 2)
      .translate(2.08, 0, 0),
    P90_LENS_SAPPHIRE
  );
  const ocularLens = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24)
      .rotateZ(Math.PI / 2)
      .translate(-2.08, 0, 0),
    P90_LENS_SAPPHIRE
  );
  const windageDrum = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 1.38, 18)
      .rotateX(Math.PI / 2)
      .translate(-0.45, -0.15, 0),
    P90_BRIGHT_STEEL
  );

  return sanitizeP90Mesh(
    applyP90RingSightUVs(
      mergeParts([hollowedOptic, objectiveLens, ocularLens, windageDrum])
    )
  );
}

/**
 * U-05: Ambidextrous Non-Reciprocating Forward Charging Handles (assembledPos: [9.40, 1.48, 0])
 */
export function buildP90ChargingHandlesGeometry(): THREE.BufferGeometry {
  const crossBar = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.24, 2.38).translate(0.55, 0, 0),
    P90_DARK_STEEL
  );
  const guideRod = paintGeometry(
    new THREE.CylinderGeometry(0.09, 0.09, 3.3, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.45, 0, 0),
    P90_BRIGHT_STEEL
  );
  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -1.6,
      end: 0.35,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.14,
      wireRadius: 0.022,
      coils: 9,
      radialSegments: 8,
      tubularSegmentsPerCoil: 12,
    }),
    P90_SPRING_STEEL
  );
  const wingLeft = paintGeometry(
    new THREE.BoxGeometry(1.12, 0.36, 0.48)
      .rotateY(0.18)
      .translate(0.45, 0, -1.34),
    P90_CHAMFER_STEEL
  );
  const wingRight = paintGeometry(
    new THREE.BoxGeometry(1.12, 0.36, 0.48)
      .rotateY(-0.18)
      .translate(0.45, 0, 1.34),
    P90_CHAMFER_STEEL
  );

  return sanitizeP90Mesh(
    mergeParts([crossBar, guideRod, returnSpring, wingLeft, wingRight])
  );
}

// ============================================================================
// 3. ERGONOMIC BULLPUP THUMBHOLE STOCK & CHUTE GROUP ('frame' F-01..F-06)
// ============================================================================

/**
 * F-01: Iconic Futuristic Polymer Ergonomic Thumbhole Bullpup Stock
 * (assembledPos: [0, 0, 0], isShell: true)
 * Spans X ∈ [-16.15, +14.55], Y ∈ [-8.20, +1.92], Z ∈ [-1.14, +1.14].
 * Authentic René Predazzi P90 ergonomic silhouette:
 *  - Rear bullpup receiver/hammer-pack housing (X ∈ [-16.15, +1.80], Y ∈ [-4.15, +1.92])
 *  - Upper horizontal magazine bed & helical feed throat opening (X ∈ [-4.95, -2.05])
 *  - Vertical downward spent-brass ejection chute (X ∈ [-5.35, -2.45]) behind grip!
 *  - Sculpted rounded ergonomic thumbhole pistol grip & enclosed oversized front trigger bow
 *  - Integrated front downward hand-stop foregrip nose (X ∈ [+9.60, +14.55])
 */
export function buildP90StockGeometry(): THREE.BufferGeometry {
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-16.15, -6.75); // Buttstock lower heel
  hullShape.lineTo(-16.15, 1.9); // Buttstock rear top edge (mates w/ buttplate)
  hullShape.lineTo(1.8, 1.9); // Horizontal top magazine bed deck
  hullShape.lineTo(1.8, 0.18); // Step down to alloy upper-receiver cradle
  hullShape.lineTo(14.55, 0.18); // Forward receiver cradle nose
  hullShape.quadraticCurveTo(14.65, -2.85, 13.85, -6.25); // Iconic P90 front hand-stop hook!
  hullShape.quadraticCurveTo(13.35, -6.65, 12.65, -5.95);
  hullShape.quadraticCurveTo(11.65, -3.55, 9.75, -2.95); // Foregrip finger curve
  hullShape.quadraticCurveTo(9.35, -5.85, 7.65, -6.65); // Oversized front trigger bow toe
  hullShape.lineTo(3.25, -7.85); // Swept pistol-grip base
  hullShape.quadraticCurveTo(1.95, -8.25, 1.25, -7.55);
  hullShape.quadraticCurveTo(0.85, -5.35, -0.45, -4.18); // Rear curve behind thumbhole grip
  hullShape.lineTo(-5.85, -4.18); // Flat bottom ejection-chute mouth deck!
  hullShape.quadraticCurveTo(-9.85, -4.45, -14.85, -6.55); // Tapered bullpup buttstock belly
  hullShape.lineTo(-16.15, -6.75);
  hullShape.closePath();

  const stockRaw = new THREE.ExtrudeGeometry(hullShape, {
    depth: 2.08,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.07,
    bevelSegments: 2,
  });
  stockRaw.translate(0, 0, -1.04);
  paintGeometry(stockRaw, P90_STOCK_BLACK);

  // Subtract ergonomic oval thumbhole, enclosed trigger window, internal bolt/pack bays & downward chute!
  const thumbholeCut = paintGeometry(
    new THREE.CylinderGeometry(1.42, 1.42, 2.8, 28)
      .rotateX(Math.PI / 2)
      .scale(1.02, 1.16, 1)
      .translate(3.05, -4.35, 0),
    P90_STOCK_DARK
  );
  const triggerWindowCut = paintGeometry(
    new THREE.CylinderGeometry(1.55, 1.55, 2.8, 28)
      .rotateX(Math.PI / 2)
      .scale(1.06, 1.24, 1)
      .translate(6.95, -3.72, 0),
    P90_STOCK_DARK
  );
  const selectorDialSlot = paintGeometry(
    new THREE.BoxGeometry(1.35, 1.15, 2.6).translate(5.95, -3.38, 0),
    P90_STOCK_DARK
  );
  const upperBoltChamber = paintGeometry(
    new THREE.BoxGeometry(18.2, 1.98, 1.76).translate(-7.1, 0.78, 0),
    P90_STOCK_DARK
  );
  const rearHammerBay = paintGeometry(
    new THREE.BoxGeometry(6.8, 2.35, 1.56).translate(-12.95, -0.78, 0),
    P90_STOCK_DARK
  );
  const helicalThroatPort = paintGeometry(
    new THREE.BoxGeometry(2.95, 0.85, 1.66).translate(-3.45, 1.72, 0),
    P90_STOCK_DARK
  );
  const downwardEjectionChute = paintGeometry(
    new THREE.BoxGeometry(2.75, 5.1, 1.08).translate(-3.9, -1.95, 0),
    P90_STOCK_DARK
  );
  const rearSlingSlotCut = paintGeometry(
    new THREE.BoxGeometry(1.75, 0.44, 2.6).translate(-13.85, -3.65, 0),
    P90_STOCK_DARK
  );
  const foreChannel = paintGeometry(
    new THREE.BoxGeometry(11.8, 1.15, 1.52).translate(7.8, -0.35, 0),
    P90_STOCK_DARK
  );

  const hollowedStock = csgSubtract(stockRaw, [
    thumbholeCut,
    triggerWindowCut,
    selectorDialSlot,
    upperBoltChamber,
    rearHammerBay,
    helicalThroatPort,
    downwardEjectionChute,
    rearSlingSlotCut,
    foreChannel,
  ]);

  return sanitizeP90Mesh(applyP90StockUVs(hollowedStock));
}

/**
 * F-02: Sliding Ribbed Polymer Buttplate & Rear Latch Cover (assembledPos: [-16.35, -1.95, 0])
 * Spans world X ∈ [-16.80, -15.90], Y ∈ [-6.80, +1.92].
 */
export function buildP90ButtplateGeometry(): THREE.BufferGeometry {
  const plateBody = paintGeometry(
    new THREE.BoxGeometry(0.82, 8.65, 2.18).translate(0, -0.45, 0),
    P90_RUBBER_BUTT
  );
  const innerSkirt = paintGeometry(
    new THREE.BoxGeometry(0.55, 7.6, 1.66).translate(0.42, -0.42, 0),
    P90_STOCK_DARK
  );
  const topLatchTab = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.45, 1.12).translate(0.18, 3.68, 0),
    P90_DARK_STEEL
  );

  const parts: THREE.BufferGeometry[] = [plateBody, innerSkirt, topLatchTab];
  for (let r = 0; r < 11; r++) {
    const ry = -4.2 + r * 0.72;
    parts.push(
      paintGeometry(
        new THREE.BoxGeometry(0.14, 0.22, 2.22).translate(-0.42, ry, 0),
        P90_STOCK_BLACK
      )
    );
  }
  return sanitizeP90Mesh(mergeParts(parts));
}

/**
 * F-03: Spring-Loaded Upper-Receiver Takedown Lock Plunger (assembledPos: [1.55, 1.38, 0])
 */
export function buildP90TakedownLockGeometry(): THREE.BufferGeometry {
  const crossPin = paintGeometry(
    new THREE.CylinderGeometry(0.24, 0.24, 2.38, 20).rotateX(Math.PI / 2),
    P90_DARK_STEEL
  );
  const lockTooth = paintGeometry(
    new THREE.BoxGeometry(0.62, 0.58, 0.78).translate(0.24, -0.28, 0),
    P90_CHAMFER_STEEL
  );
  const detentSpring = paintGeometry(
    createHelicalSpring({
      axis: 'y',
      start: -0.55,
      end: 0.35,
      centerX: -0.15,
      centerZ: 0.52,
      coilRadius: 0.14,
      wireRadius: 0.024,
      coils: 6,
      radialSegments: 8,
      tubularSegmentsPerCoil: 12,
    }),
    P90_SPRING_STEEL
  );
  const pushCapL = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 0.18, 20)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -1.16),
    P90_BRIGHT_STEEL
  );

  return sanitizeP90Mesh(
    mergeParts([crossPin, lockTooth, detentSpring, pushCapL])
  );
}

/**
 * F-04: Ambidextrous Sliding Top-Magazine Release Catches (assembledPos: [-4.95, 1.98, 0])
 */
export function buildP90MagCatchesGeometry(): THREE.BufferGeometry {
  const bridgeYoke = paintGeometry(
    new THREE.BoxGeometry(1.45, 0.32, 2.36),
    P90_STOCK_BLACK
  );
  const tabLeft = paintGeometry(
    new THREE.BoxGeometry(1.28, 0.48, 0.26).translate(-0.1, 0.12, -1.24),
    P90_CHAMFER_STEEL
  );
  const tabRight = paintGeometry(
    new THREE.BoxGeometry(1.28, 0.48, 0.26).translate(-0.1, 0.12, 1.24),
    P90_CHAMFER_STEEL
  );
  const hookClaw = paintGeometry(
    new THREE.BoxGeometry(0.44, 0.46, 0.92).translate(0.56, 0.28, 0),
    P90_DARK_STEEL
  );
  const catchSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -1.15,
      end: -0.15,
      centerY: -0.05,
      centerZ: 0,
      coilRadius: 0.13,
      wireRadius: 0.022,
      coils: 6,
      radialSegments: 8,
      tubularSegmentsPerCoil: 12,
    }),
    P90_SPRING_STEEL
  );

  return sanitizeP90Mesh(
    mergeParts([bridgeYoke, tabLeft, tabRight, hookClaw, catchSpring])
  );
}

/**
 * F-05: Bottom Ejection Chute Spring-Loaded Dust Cover (assembledPos: [-3.90, -4.18, 0])
 */
export function buildP90EjectionCoverGeometry(): THREE.BufferGeometry {
  const flapDoor = paintGeometry(
    new THREE.BoxGeometry(2.68, 0.16, 1.18),
    P90_STOCK_BLACK
  );
  const hingeTube = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 2.74, 16)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.08, -0.58),
    P90_DARK_STEEL
  );
  const hingePin = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 2.96, 12)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.08, -0.58),
    P90_BRIGHT_STEEL
  );
  const stiffeningRib = paintGeometry(
    new THREE.BoxGeometry(2.2, 0.08, 0.28).translate(0, -0.1, 0.12),
    P90_CHAMFER_STEEL
  );

  return sanitizeP90Mesh(
    mergeParts([flapDoor, hingeTube, hingePin, stiffeningRib])
  );
}

/**
 * F-06: Tactical Rear Sling Slot Liner & Forward Sling Loop Hardware (assembledPos: [-8.50, -0.45, 0])
 */
export function buildP90SlingMountGeometry(): THREE.BufferGeometry {
  // Rear buttstock sling slot steel liner (at local X = -5.35, Y = -3.20 -> world [-13.85, -3.65])
  const rearLiner = csgSubtract(
    paintGeometry(
      new THREE.BoxGeometry(1.92, 0.68, 2.22).translate(-5.35, -3.2, 0),
      P90_DARK_STEEL
    ),
    [
      paintGeometry(
        new THREE.BoxGeometry(1.48, 0.32, 2.5).translate(-5.35, -3.2, 0),
        P90_INNER_DARK
      ),
    ]
  );

  // Forward left receiver sling loop & cross-stud (at local X = +11.15, Y = +1.85 -> world [+2.65, +1.40])
  const frontStud = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 2.24, 18)
      .rotateX(Math.PI / 2)
      .translate(11.15, 1.85, 0),
    P90_CHAMFER_STEEL
  );
  const frontLoop = paintGeometry(
    new THREE.TorusGeometry(0.38, 0.075, 12, 24)
      .rotateY(Math.PI / 2)
      .translate(11.15, 1.65, -1.18),
    P90_BRIGHT_STEEL
  );

  return sanitizeP90Mesh(mergeParts([rearLiner, frontStud, frontLoop]));
}

// Re-export sanitized extra builders with precision UV unwrappers applied where PBR is bound
export function buildP90BoltSanitized(): THREE.BufferGeometry {
  return sanitizeP90Mesh(buildP90BoltGeometry());
}
export function buildP90FiringPinSanitized(): THREE.BufferGeometry {
  return sanitizeP90Mesh(buildP90FiringPinGeometry());
}
export function buildP90GuideRodsSanitized(): THREE.BufferGeometry {
  return sanitizeP90Mesh(buildP90GuideRodsGeometry());
}
export function buildP90RecoilSpringsSanitized(): THREE.BufferGeometry {
  return sanitizeP90Mesh(buildP90RecoilSpringsGeometry());
}
export function buildP90TriggerSanitized(): THREE.BufferGeometry {
  return sanitizeP90Mesh(buildP90TriggerGeometry());
}
export function buildP90SelectorSanitized(): THREE.BufferGeometry {
  return sanitizeP90Mesh(buildP90SelectorGeometry());
}
export function buildP90TransferBarsSanitized(): THREE.BufferGeometry {
  return sanitizeP90Mesh(buildP90TransferBarsGeometry());
}
export function buildP90HammerPackSanitized(): THREE.BufferGeometry {
  return sanitizeP90Mesh(buildP90HammerPackGeometry());
}
export function buildP90HammerSanitized(): THREE.BufferGeometry {
  return sanitizeP90Mesh(buildP90HammerGeometry());
}
export function buildP90MagBodySanitized(): THREE.BufferGeometry {
  return sanitizeP90Mesh(applyP90MagBodyUVs(buildP90MagBodyGeometry()));
}
export function buildP90HelicalRampSanitized(): THREE.BufferGeometry {
  return sanitizeP90Mesh(applyP90HelicalRampUVs(buildP90HelicalRampGeometry()));
}
export function buildP90MagFollowerSanitized(): THREE.BufferGeometry {
  return sanitizeP90Mesh(buildP90MagFollowerGeometry());
}
export function buildP90MagSpringSanitized(): THREE.BufferGeometry {
  return sanitizeP90Mesh(buildP90MagSpringGeometry());
}
export function buildP90MagFloorplateSanitized(): THREE.BufferGeometry {
  return sanitizeP90Mesh(buildP90MagFloorplateGeometry());
}
