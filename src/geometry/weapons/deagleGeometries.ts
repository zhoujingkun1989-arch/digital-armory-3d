import * as THREE from 'three';
import {
  csgSubtract,
  csgUnion,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../springHelper';

export const DEAGLE_CHROME = '#b4c0ce';
export const DEAGLE_CHROME_MIRROR = '#c2cdd9';
export const DEAGLE_MILLED_DARK = '#252b36';
export const DEAGLE_NITRIDE = '#262d38';
export const DEAGLE_RUBBER = '#181b20';

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
  const cr = col ? (col.getX(i0) + col.getX(i1) + col.getX(i2)) / 3 : 0.8;
  return { cx, cy, cz, cr, fnx: fNorm.x, fny: fNorm.y, fnz: fNorm.z };
}

/**
 * Unwraps Silver Chrome parts (Slide, Barrel, Frame) onto 2048x1024 deagle_chrome_{albedo,normal,roughness}.png:
 *  - Right (+Z) wall: u in [0.02, 0.98], v in [0.66, 0.97]
 *  - Left (-Z) wall:  u in [0.02, 0.98], v in [0.31, 0.62] (mirrored U so rollmarks read left-to-right!)
 *  - Dark milled recesses / bores / serration cuts (cr < 0.12): u in [0.745, 0.850], v in [0.03, 0.25]
 *  - Polished chrome top deck / scope slots / front strap:      u in [0.875, 0.985], v in [0.03, 0.25]
 */
export function applyDeagleChromeUVs(
  geo: THREE.BufferGeometry,
  opts: {
    xMin: number;
    xSpan: number;
    yMin: number;
    ySpan: number;
    uRightRange?: [number, number];
    uLeftRange?: [number, number];
    vRightRange?: [number, number];
    vLeftRange?: [number, number];
  }
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  const [uR0, uR1] = opts.uRightRange ?? [0.02, 0.98];
  const [uL0, uL1] = opts.uLeftRange ?? [0.02, 0.98];
  const [vR0, vR1] = opts.vRightRange ?? [0.66, 0.97];
  const [vL0, vL1] = opts.vLeftRange ?? [0.31, 0.62];

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, cr, fnz } = triInfo(pos, col, i, i + 1, i + 2);

    let mode: 'milled' | 'right' | 'left' | 'mirror_deck' = 'mirror_deck';
    if (cr < 0.12) {
      mode = 'milled';
    } else if (fnz > 0.34 && cz > 0.32) {
      mode = 'right';
    } else if (fnz < -0.34 && cz < -0.32) {
      mode = 'left';
    }

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);
      const xNorm = clamp01((x - opts.xMin) / opts.xSpan);
      const yNorm = clamp01((y - opts.yMin) / opts.ySpan);

      let u: number;
      let v: number;
      if (mode === 'milled') {
        u = 0.745 + fractPos((x + z) * 0.12) * 0.105;
        v = 0.03 + fractPos(y * 0.18) * 0.22;
      } else if (mode === 'right') {
        u = uR0 + xNorm * (uR1 - uR0);
        v = vR0 + yNorm * (vR1 - vR0);
      } else if (mode === 'left') {
        u = uL0 + (1.0 - xNorm) * (uL1 - uL0);
        v = vL0 + yNorm * (vL1 - vL0);
      } else {
        u = 0.875 + xNorm * 0.11;
        v = 0.03 + clamp01((z + 1.5) / 3.0) * 0.22;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * Unwraps Wrap-Around Stippled Rubber Grip onto bottom-left swatch (u in [0.04, 0.70], v in [0.03, 0.26])
 * of 2048x1024 deagle_chrome_{albedo,normal,roughness}.png, centering the IMI/MRI Eagle medallion on both flanks.
 */
export function applyDeagleGripUVs(
  geo: THREE.BufferGeometry
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i + 2 < count; i += 3) {
    const { cz, fnz } = triInfo(pos, col, i, i + 1, i + 2);
    const isSideFlank = Math.abs(fnz) > 0.35 && Math.abs(cz) > 0.65;

    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const x = pos.getX(vi);
      const y = pos.getY(vi);
      const z = pos.getZ(vi);

      let u: number;
      let v: number;
      if (isSideFlank) {
        const xNorm = clamp01((x - -9.2) / 5.4);
        const yNorm = clamp01((y - -10.15) / 8.8);
        u =
          fnz > 0
            ? 0.2 + xNorm * 0.36
            : 0.2 + (1.0 - xNorm) * 0.36;
        v = 0.04 + yNorm * 0.21;
      } else {
        // Backstrap & inner rubber surfaces avoid center medallion
        u = 0.06 + clamp01((z + 1.55) / 3.1) * 0.12;
        v = 0.04 + clamp01((y - -10.15) / 8.8) * 0.21;
      }
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/**
 * B-01: Iconic Desert Eagle Mark XIX 6" Fixed Triangular-Profile Barrel
 * Features triangular wedge cross-section, Mark XIX side lightening flutes, integral 8-slot Picatinny/Weaver
 * top scope rail, .50 AE hollow bore & recessed crown, 4-lug rear chamber extension, polished feed ramp,
 * under-bore gas port & forward gas cylinder cup.
 */
export function buildDeagleBarrelGeometry(): THREE.BufferGeometry {
  // 1. Signature Triangular Barrel Cross-Section in (Z, Y) extruded from X = +1.85 to +16.00 (L = 14.15)
  const triSec = new THREE.Shape();
  triSec.moveTo(-1.38, 1.7);
  triSec.lineTo(1.38, 1.7);
  triSec.lineTo(1.38, 2.36);
  // Mark XIX flat angled triangular upper flanks tapering inward to top scope rib
  triSec.lineTo(0.84, 3.96);
  triSec.lineTo(0.84, 4.16);
  triSec.lineTo(-0.84, 4.16);
  triSec.lineTo(-0.84, 3.96);
  triSec.lineTo(-1.38, 2.36);
  triSec.closePath();

  const barrelBody = new THREE.ExtrudeGeometry(triSec, {
    depth: 14.1,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 2,
    steps: 1,
  });
  barrelBody.rotateY(Math.PI / 2);
  barrelBody.translate(1.86, 0, 0);
  paintGeometry(barrelBody, DEAGLE_CHROME);

  // 2. Rear 4-Lug Cylindrical Chamber Extension Ring (seats inside slide breech X in [-0.62, +1.92])
  const chamberRing = paintGeometry(
    new THREE.CylinderGeometry(0.95, 0.95, 2.52, 28)
      .rotateZ(Math.PI / 2)
      .translate(0.64, 2.6, 0),
    DEAGLE_CHROME_MIRROR
  );

  // Polished .50 AE Wide Feed Ramp at rear-bottom of chamber throat
  const feedRamp = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.72, 0.92)
      .rotateZ(0.52)
      .translate(-0.56, 1.78, 0),
    DEAGLE_CHROME_MIRROR
  );

  // 3. Under-Barrel Gas Channel Belly & Forward Rearward-Facing Gas Cylinder Block
  const gasBelly = paintGeometry(
    new THREE.BoxGeometry(12.45, 0.56, 1.24).translate(8.42, 1.48, 0),
    DEAGLE_CHROME
  );
  const gasCylinderBoss = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.42, 2.15, 24)
      .rotateZ(Math.PI / 2)
      .translate(13.65, 1.48, 0),
    DEAGLE_CHROME
  );

  // Bottom Frame Locking Lug (latches onto rotating takedown cross-shaft at X = 3.15, Y = 0.36)
  const lockLugShape = new THREE.Shape();
  lockLugShape.moveTo(2.42, 1.35);
  lockLugShape.lineTo(3.92, 1.35);
  lockLugShape.lineTo(3.78, 0.45);
  lockLugShape.lineTo(2.56, 0.45);
  lockLugShape.closePath();
  const lockLug = new THREE.ExtrudeGeometry(lockLugShape, {
    depth: 0.92,
    bevelEnabled: false,
  });
  lockLug.translate(0, 0, -0.46);
  paintGeometry(lockLug, DEAGLE_CHROME);

  const rawBarrel = mergeParts([
    barrelBody,
    chamberRing,
    feedRamp,
    gasBelly,
    gasCylinderBoss,
    lockLug,
  ]);

  const cutters: THREE.BufferGeometry[] = [];

  // Massive .50 Action Express (12.7mm) Hollow Bore & Chamber Throat
  const bore = paintGeometry(
    new THREE.CylinderGeometry(0.545, 0.545, 17.2, 28)
      .rotateZ(Math.PI / 2)
      .translate(7.7, 2.6, 0),
    DEAGLE_MILLED_DARK
  );
  cutters.push(bore);

  // Recessed Muzzle Target Crown Dish at X = +16.0
  const crownDish = paintGeometry(
    new THREE.CylinderGeometry(0.66, 0.54, 0.18, 28)
      .rotateZ(Math.PI / 2)
      .translate(15.96, 2.6, 0),
    DEAGLE_MILLED_DARK
  );
  cutters.push(crownDish);

  // Sleek Desert Eagle Angled Muzzle Face Bevel at lower front corner
  const muzzleChinBevel = paintGeometry(
    new THREE.BoxGeometry(0.85, 1.4, 3.2)
      .rotateZ(0.24)
      .translate(16.32, 1.95, 0),
    DEAGLE_CHROME_MIRROR
  );
  cutters.push(muzzleChinBevel);

  // 8 Integral Mark XIX Top Picatinny / Weaver Scope Cross-Slots (X = 3.2 .. 12.3)
  for (let i = 0; i < 8; i++) {
    const sx = 3.25 + i * 1.28;
    const slot = paintGeometry(
      new THREE.BoxGeometry(0.52, 0.22, 1.95).translate(sx, 4.12, 0),
      DEAGLE_MILLED_DARK
    );
    cutters.push(slot);
  }

  // Front Sight Dovetail Slot at X = 15.05
  const frontDovetail = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.14, 1.9).translate(15.05, 4.13, 0),
    DEAGLE_MILLED_DARK
  );
  cutters.push(frontDovetail);

  // Mark XIX Signature Side Lightening Flutes along both angled triangular flanks
  for (const sign of [-1, 1]) {
    const flute = paintGeometry(
      new THREE.CylinderGeometry(0.22, 0.22, 8.8, 18)
        .rotateZ(Math.PI / 2)
        .rotateX(sign * 0.32)
        .translate(8.85, 2.98, sign * 1.15),
      DEAGLE_CHROME_MIRROR
    );
    cutters.push(flute);
  }

  // Rearward-facing Gas Cylinder Cup Bore (receives Slide's integrated gas piston at Y = 1.48!)
  const gasCupBore = paintGeometry(
    new THREE.CylinderGeometry(0.34, 0.34, 1.85, 22)
      .rotateZ(Math.PI / 2)
      .translate(13.45, 1.48, 0),
    DEAGLE_MILLED_DARK
  );
  cutters.push(gasCupBore);

  // Diagonal Under-Bore Gas Bleed Port near chamber throat (visible in cutaway!)
  const gasBleedPort = paintGeometry(
    new THREE.CylinderGeometry(0.11, 0.11, 0.95, 14)
      .rotateZ(-0.48)
      .translate(3.55, 1.98, 0),
    DEAGLE_MILLED_DARK
  );
  cutters.push(gasBleedPort);

  // Semicircular Takedown Cross-Cam Notch in lower barrel lug
  const takedownNotch = paintGeometry(
    new THREE.CylinderGeometry(0.26, 0.26, 1.2, 18)
      .rotateX(Math.PI / 2)
      .translate(3.15, 0.45, 0),
    DEAGLE_MILLED_DARK
  );
  cutters.push(takedownNotch);

  return applyDeagleChromeUVs(csgSubtract(rawBarrel, cutters), {
    xMin: -9.6,
    xSpan: 25.6,
    yMin: 0.85,
    ySpan: 3.35,
  });
}

/**
 * B-02: Open-Top Bridge Slide with Integrated Forward Gas Piston Rod
 * Rear breech block wraps around 4-lug rotating bolt, twin lower chrome bridge bars run forward alongside
 * the stationary barrel to the front muzzle collar, carrying the rearward-pointing stainless gas piston!
 */
export function buildDeagleSlideGeometry(): THREE.BufferGeometry {
  // 1. Full Triangular Envelope extruded from X = -9.55 to +15.92 (carved into open-top bridge via CSG!)
  const slideSec = new THREE.Shape();
  slideSec.moveTo(-1.41, 0.88);
  slideSec.lineTo(1.41, 0.88);
  slideSec.lineTo(1.41, 2.38);
  slideSec.lineTo(0.86, 3.98);
  slideSec.lineTo(0.86, 4.16);
  slideSec.lineTo(-0.86, 4.16);
  slideSec.lineTo(-0.86, 3.98);
  slideSec.lineTo(-1.41, 2.38);
  slideSec.closePath();

  const rawHull = new THREE.ExtrudeGeometry(slideSec, {
    depth: 25.42,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.03,
    bevelSegments: 2,
    steps: 1,
  });
  rawHull.rotateY(Math.PI / 2);
  rawHull.translate(-9.52, 0, 0);
  paintGeometry(rawHull, DEAGLE_CHROME);

  const cutters: THREE.BufferGeometry[] = [];

  // 1. Massive Open-Top Barrel Window (X in [+1.85, +14.55], Y > 1.70) where fixed 6" barrel sits stationary!
  const openBarrelBridgeCut = paintGeometry(
    new THREE.BoxGeometry(12.72, 2.85, 3.2).translate(8.21, 3.125, 0),
    DEAGLE_CHROME_MIRROR
  );
  cutters.push(openBarrelBridgeCut);

  // Also open top above front muzzle ring (X in [+14.50, +16.10], Y > 1.70) so fixed barrel muzzle sits unobstructed!
  const frontTopBarrelClear = paintGeometry(
    new THREE.BoxGeometry(1.75, 2.85, 3.2).translate(15.32, 3.125, 0),
    DEAGLE_CHROME_MIRROR
  );
  cutters.push(frontTopBarrelClear);

  // Center channel between twin forward bridge bars (X in [+1.85, +14.42], Z in [-0.86, +0.86], Y in [0.80, 1.75])
  const centerBridgeGap = paintGeometry(
    new THREE.BoxGeometry(12.58, 1.02, 1.72).translate(8.14, 1.28, 0),
    DEAGLE_MILLED_DARK
  );
  cutters.push(centerBridgeGap);

  // 2. Wide Flared Right-Top Ejection Cutout in Rear Breech Hood (X in [-0.62, +1.88])
  const ejectTopCut = paintGeometry(
    new THREE.BoxGeometry(2.52, 1.45, 2.05).translate(0.64, 3.65, 0.35),
    DEAGLE_MILLED_DARK
  );
  cutters.push(ejectTopCut);

  const ejectSideCut = paintGeometry(
    new THREE.BoxGeometry(2.52, 1.85, 1.65).translate(0.64, 2.82, 0.85),
    DEAGLE_MILLED_DARK
  );
  cutters.push(ejectSideCut);

  // 3. Internal Bolt Carrier Tunnel + Lower Frame Rail Channel + Rear Hammer Clearance Slot
  const boltTunnel = paintGeometry(
    new THREE.CylinderGeometry(1.02, 1.02, 10.6, 28)
      .rotateZ(Math.PI / 2)
      .translate(-3.1, 2.6, 0),
    DEAGLE_MILLED_DARK
  );
  cutters.push(boltTunnel);

  const lowerBreechSlot = paintGeometry(
    new THREE.BoxGeometry(11.6, 1.05, 1.98).translate(-3.75, 1.28, 0),
    DEAGLE_MILLED_DARK
  );
  cutters.push(lowerBreechSlot);

  const guideRailGroove = paintGeometry(
    new THREE.BoxGeometry(23.8, 0.22, 2.34).translate(2.4, 1.02, 0),
    DEAGLE_MILLED_DARK
  );
  cutters.push(guideRailGroove);

  // Rear Hammer Strike Slot (allows exposed SA spur hammer to swing into firing pin at Y = 2.60!)
  const hammerSlot = paintGeometry(
    new THREE.BoxGeometry(1.65, 2.35, 0.68).translate(-9.05, 2.15, 0),
    DEAGLE_MILLED_DARK
  );
  cutters.push(hammerSlot);

  // Angled Rear Slide Profile Bevel matching Desert Eagle swooping rear tang
  const rearSlopeCut = paintGeometry(
    new THREE.BoxGeometry(1.2, 3.8, 3.2)
      .rotateZ(-0.18)
      .translate(-9.92, 2.5, 0),
    DEAGLE_CHROME_MIRROR
  );
  cutters.push(rearSlopeCut);

  // Angled Front Chin Bevel at X = +15.92
  const frontChinBevel = paintGeometry(
    new THREE.BoxGeometry(0.75, 1.6, 3.2)
      .rotateZ(0.24)
      .translate(16.12, 1.25, 0),
    DEAGLE_CHROME_MIRROR
  );
  cutters.push(frontChinBevel);

  // Twin Front Recoil Rod Seat Holes at Y = 1.18, Z = ±0.48
  for (const sign of [-1, 1]) {
    const rodHole = paintGeometry(
      new THREE.CylinderGeometry(0.24, 0.24, 1.8, 18)
        .rotateZ(Math.PI / 2)
        .translate(15.2, 1.18, sign * 0.48),
      DEAGLE_MILLED_DARK
    );
    cutters.push(rodHole);
  }

  // Transverse Safety Drum Bore at X = -7.35, Y = 2.68 + Rear Sight Dovetail at X = -7.85
  const safetyBore = paintGeometry(
    new THREE.CylinderGeometry(0.42, 0.42, 3.1, 22)
      .rotateX(Math.PI / 2)
      .translate(-7.35, 2.68, 0),
    DEAGLE_MILLED_DARK
  );
  cutters.push(safetyBore);

  const rearDovetail = paintGeometry(
    new THREE.BoxGeometry(0.58, 0.15, 2.1).translate(-7.85, 4.13, 0),
    DEAGLE_MILLED_DARK
  );
  cutters.push(rearDovetail);

  // Left-side Slide Stop Catch Notch at X = -2.65
  const slideStopNotch = paintGeometry(
    new THREE.BoxGeometry(0.72, 0.46, 0.55).translate(-2.65, 1.02, -1.25),
    DEAGLE_MILLED_DARK
  );
  cutters.push(slideStopNotch);

  // 9 Crisp Angled (-14°) Desert Eagle Rear Cocking Serrations on Left & Right Breech Walls
  for (let i = 0; i < 9; i++) {
    const sx = -8.35 + i * 0.42;
    for (const sign of [-1, 1]) {
      const groove = paintGeometry(
        new THREE.BoxGeometry(0.19, 1.65, 0.22)
          .rotateZ(-0.24)
          .translate(sx, 1.98, sign * 1.4),
        DEAGLE_MILLED_DARK
      );
      cutters.push(groove);
    }
  }

  const carvedSlide = csgSubtract(rawHull, cutters);

  // 4. Integrated Forward Stainless Gas Piston Rod & Triple-Ring Piston Head (cantilevered rearward from X = 14.50 to 12.85 at Y = 1.48!)
  const pistonNeck = paintGeometry(
    new THREE.CylinderGeometry(0.21, 0.23, 1.45, 22)
      .rotateZ(Math.PI / 2)
      .translate(13.82, 1.48, 0),
    DEAGLE_CHROME_MIRROR
  );
  const pistonHead = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 0.52, 24)
      .rotateZ(Math.PI / 2)
      .translate(12.98, 1.48, 0),
    '#c8b28a' // Subtle warm heat-tinted hard chrome piston head!
  );
  const pistonCarbonFace = paintGeometry(
    new THREE.CylinderGeometry(0.31, 0.31, 0.08, 22)
      .rotateZ(Math.PI / 2)
      .translate(12.7, 1.48, 0),
    DEAGLE_MILLED_DARK
  );

  const fullSlide = csgUnion([
    carvedSlide,
    pistonNeck,
    pistonHead,
    pistonCarbonFace,
  ]);

  return applyDeagleChromeUVs(fullSlide, {
    xMin: -9.6,
    xSpan: 25.6,
    yMin: 0.85,
    ySpan: 3.35,
  });
}

/**
 * B-03: 4-Lug Rotating Bolt Head (assembledPos: [-1.45, 2.60, 0])
 * Centered strictly on bore axis (Y = 2.60, Z = 0) so rotating rx in firing kinematics spins concentrically!
 */
export function buildDeagleBoltGeometry(): THREE.BufferGeometry {
  // Cylindrical bolt body along X
  const stem = paintGeometry(
    new THREE.CylinderGeometry(0.62, 0.62, 2.85, 26)
      .rotateZ(Math.PI / 2)
      .translate(-0.48, 0, 0),
    DEAGLE_CHROME_MIRROR
  );

  // 4 Heavy Radial Locking Lugs (90° spacing at front bolt head lx in [+0.68, +1.22])
  const lugs: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const ang = (k * Math.PI) / 2 + Math.PI / 4;
    const lug = paintGeometry(
      new THREE.BoxGeometry(0.54, 0.42, 0.38)
        .translate(0.95, 0.66, 0)
        .rotateX(ang),
      DEAGLE_CHROME
    );
    lugs.push(lug);
  }

  // Spring-loaded Ejector Plunger Pin protruding slightly on left-lower bolt face
  const ejectorPin = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.24, 14)
      .rotateZ(Math.PI / 2)
      .translate(1.18, -0.18, -0.24),
    '#94a3b8'
  );

  const solidBolt = mergeParts([stem, ...lugs, ejectorPin]);

  // Recessed .50 AE Bolt Face + Firing Pin Bore + Extractor Cut + Cam Pin Slot
  const facePocket = paintGeometry(
    new THREE.CylinderGeometry(0.47, 0.47, 0.22, 24)
      .rotateZ(Math.PI / 2)
      .translate(1.18, 0, 0),
    DEAGLE_MILLED_DARK
  );
  const fpBore = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 3.8, 18)
      .rotateZ(Math.PI / 2)
      .translate(-0.3, 0, 0),
    DEAGLE_MILLED_DARK
  );
  const extSlot = paintGeometry(
    new THREE.BoxGeometry(1.35, 0.34, 0.45).translate(0.65, 0.08, 0.56),
    DEAGLE_MILLED_DARK
  );
  const camHole = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 1.4, 18).translate(-0.8, 0.25, 0),
    DEAGLE_MILLED_DARK
  );

  return csgSubtract(solidBolt, [facePocket, fpBore, extSlot, camHole]);
}

/** B-04: Bolt Helical Cam Control Pin (assembledPos: [-2.25, 2.60, 0]) */
export function buildDeagleCamPinGeometry(): THREE.BufferGeometry {
  const shaft = paintGeometry(
    new THREE.CylinderGeometry(0.2, 0.2, 0.92, 20).translate(0, 0.16, 0),
    DEAGLE_CHROME_MIRROR
  );
  const camHead = paintGeometry(
    new THREE.BoxGeometry(0.56, 0.34, 0.44).translate(0, 0.68, 0),
    DEAGLE_CHROME
  );
  const fpPassHole = paintGeometry(
    new THREE.CylinderGeometry(0.13, 0.13, 0.6, 16)
      .rotateZ(Math.PI / 2)
      .translate(0, 0, 0),
    DEAGLE_MILLED_DARK
  );
  return csgSubtract(mergeParts([shaft, camHead]), [fpPassHole]);
}

/** B-05: Heavy Stainless Firing Pin & Return Coil Spring (assembledPos: [-4.55, 2.60, 0]) */
export function buildDeagleFiringPinGeometry(): THREE.BufferGeometry {
  const needle = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.12, 1.65, 18)
      .rotateZ(Math.PI / 2)
      .translate(3.42, 0, 0),
    DEAGLE_CHROME_MIRROR
  );
  const bodyShaft = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 5.4, 20)
      .rotateZ(Math.PI / 2)
      .translate(-0.05, 0, 0),
    DEAGLE_CHROME
  );
  const stopCollar = paintGeometry(
    new THREE.CylinderGeometry(0.27, 0.27, 0.28, 20)
      .rotateZ(Math.PI / 2)
      .translate(-2.85, 0, 0),
    DEAGLE_CHROME_MIRROR
  );
  const strikeHead = paintGeometry(
    new THREE.CylinderGeometry(0.22, 0.22, 1.35, 20)
      .rotateZ(Math.PI / 2)
      .translate(-3.58, 0, 0),
    DEAGLE_NITRIDE
  );
  const returnSpring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -2.65,
      end: 1.85,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.23,
      wireRadius: 0.036,
      coils: 16,
    }),
    '#94a3b8'
  );
  return mergeParts([needle, bodyShaft, stopCollar, strikeHead, returnSpring]);
}

/**
 * B-06: Bolt-Head Claw Extractor & Plunger (assembledPos: [-0.85, 2.60, 0])
 * Offset in local Z (+0.54) so rx rotation around bore centerline orbits cleanly with deagle_bolt!
 */
export function buildDeagleExtractorGeometry(): THREE.BufferGeometry {
  const bar = paintGeometry(
    new THREE.BoxGeometry(1.32, 0.28, 0.24).translate(0, 0.08, 0.54),
    DEAGLE_NITRIDE
  );
  const claw = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.32, 0.34).translate(0.58, 0.08, 0.42),
    '#384252'
  );
  const pivotBoss = paintGeometry(
    new THREE.CylinderGeometry(0.14, 0.14, 0.32, 16).translate(
      -0.25,
      0.08,
      0.52
    ),
    DEAGLE_NITRIDE
  );
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: -0.95,
      end: -0.52,
      centerY: 0.08,
      centerZ: 0.5,
      coilRadius: 0.1,
      wireRadius: 0.022,
      coils: 5,
    }),
    '#94a3b8'
  );
  return mergeParts([bar, claw, pivotBoss, spring]);
}

/** B-07: Slide-Mounted Ambidextrous Tear-Drop Safety Levers & Blocking Drum (assembledPos: [-7.35, 2.68, 0]) */
export function buildDeagleSafetyGeometry(): THREE.BufferGeometry {
  const drum = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 2.86, 22).rotateX(Math.PI / 2),
    DEAGLE_NITRIDE
  );

  // Sculpted forward-swept Desert Eagle tear-drop lever profile
  const leverShape = new THREE.Shape();
  leverShape.moveTo(-0.35, -0.32);
  leverShape.quadraticCurveTo(0.45, -0.42, 1.42, -0.18);
  leverShape.quadraticCurveTo(1.68, 0.02, 1.38, 0.28);
  leverShape.quadraticCurveTo(0.45, 0.38, -0.35, 0.32);
  leverShape.quadraticCurveTo(-0.52, 0, -0.35, -0.32);
  leverShape.closePath();

  const levers: THREE.BufferGeometry[] = [];
  for (const sign of [-1, 1]) {
    const wing = new THREE.ExtrudeGeometry(leverShape, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    wing.translate(0, 0, sign > 0 ? 1.38 : -1.56);
    paintGeometry(wing, DEAGLE_NITRIDE);

    const thumbPad = paintGeometry(
      new THREE.BoxGeometry(0.55, 0.26, 0.12).translate(
        1.15,
        -0.06,
        sign * 1.58
      ),
      '#394353'
    );
    levers.push(wing, thumbPad);
  }

  return mergeParts([drum, ...levers]);
}

/** B-08: Dovetail Combat Sloped Ramp Front Sight (assembledPos: [15.05, 4.16, 0]) */
export function buildDeagleFrontSightGeometry(): THREE.BufferGeometry {
  const dovetail = paintGeometry(
    new THREE.BoxGeometry(0.52, 0.14, 1.32).translate(0, -0.05, 0),
    DEAGLE_NITRIDE
  );

  const rampShape = new THREE.Shape();
  rampShape.moveTo(-0.52, 0);
  rampShape.lineTo(0.52, 0);
  rampShape.lineTo(0.22, 0.52);
  rampShape.lineTo(-0.48, 0.52);
  rampShape.closePath();

  const blade = new THREE.ExtrudeGeometry(rampShape, {
    depth: 0.28,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  blade.translate(0, 0, -0.14);
  paintGeometry(blade, DEAGLE_NITRIDE);

  const tritiumDot = paintGeometry(
    new THREE.CylinderGeometry(0.085, 0.085, 0.04, 16)
      .rotateZ(Math.PI / 2)
      .translate(-0.5, 0.32, 0),
    '#f8fafc'
  );

  return mergeParts([dovetail, blade, tritiumDot]);
}

/** B-09: Dovetail Combat Square-Notch Rear Sight (assembledPos: [-7.85, 4.16, 0]) */
export function buildDeagleRearSightGeometry(): THREE.BufferGeometry {
  const dovetail = paintGeometry(
    new THREE.BoxGeometry(0.54, 0.14, 1.56).translate(0, -0.05, 0),
    DEAGLE_NITRIDE
  );

  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-0.52, 0);
  bodyShape.lineTo(0.56, 0);
  bodyShape.lineTo(0.32, 0.52);
  bodyShape.lineTo(-0.48, 0.52);
  bodyShape.closePath();

  const body = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 1.62,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  body.translate(0, 0, -0.81);
  paintGeometry(body, DEAGLE_NITRIDE);

  const squareNotch = paintGeometry(
    new THREE.BoxGeometry(1.3, 0.3, 0.42).translate(0, 0.42, 0),
    '#141820'
  );
  const slotted = csgSubtract(mergeParts([dovetail, body]), [squareNotch]);

  const dotL = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.04, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.5, 0.3, -0.38),
    '#f8fafc'
  );
  const dotR = paintGeometry(
    new THREE.CylinderGeometry(0.075, 0.075, 0.04, 14)
      .rotateZ(Math.PI / 2)
      .translate(-0.5, 0.3, 0.38),
    '#f8fafc'
  );

  return mergeParts([slotted, dotL, dotR]);
}

/**
 * B-10: Dual Parallel Stainless Recoil Guide Rods & Figure-8 Retainer Yoke Plate (assembledPos: [0, 0, 0])
 * Signature Mark XIX Desert Eagle twin-rod recoil guide sub-assembly!
 */
export function buildDeagleRecoilRodsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  for (const sign of [-1, 1]) {
    const zPos = sign * 0.48;
    const shaft = paintGeometry(
      new THREE.CylinderGeometry(0.145, 0.145, 12.15, 20)
        .rotateZ(Math.PI / 2)
        .translate(8.32, 1.18, zPos),
      DEAGLE_CHROME_MIRROR
    );
    const rearHead = paintGeometry(
      new THREE.CylinderGeometry(0.26, 0.26, 0.2, 20)
        .rotateZ(Math.PI / 2)
        .translate(2.15, 1.18, zPos),
      DEAGLE_CHROME
    );
    const frontTip = paintGeometry(
      new THREE.CylinderGeometry(0.12, 0.145, 0.28, 18)
        .rotateZ(Math.PI / 2)
        .translate(14.52, 1.18, zPos),
      DEAGLE_CHROME_MIRROR
    );
    parts.push(shaft, rearHead, frontTip);
  }

  // Iconic Figure-8 Machined Steel Recoil Spring Retainer Yoke Plate at X = 2.32
  const plateBridge = paintGeometry(
    new THREE.BoxGeometry(0.18, 0.62, 1.66).translate(2.32, 1.18, 0),
    DEAGLE_CHROME
  );
  const ringL = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 0.2, 22)
      .rotateZ(Math.PI / 2)
      .translate(2.32, 1.18, -0.48),
    DEAGLE_CHROME
  );
  const ringR = paintGeometry(
    new THREE.CylinderGeometry(0.36, 0.36, 0.2, 22)
      .rotateZ(Math.PI / 2)
      .translate(2.32, 1.18, 0.48),
    DEAGLE_CHROME
  );
  parts.push(plateBridge, ringL, ringR);

  return mergeParts(parts);
}

/**
 * B-11: Twin Parallel Multi-Strand Helical Recoil Springs (assembledPos: [0, 0, 0])
 * Spans X in [2.46, 14.32] (L0 = 11.86) at Y = 1.18, Z = ±0.48; compresses smoothly on recoil!
 */
export function buildDeagleRecoilSpringsGeometry(): THREE.BufferGeometry {
  const springL = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 2.46,
      end: 14.32,
      centerY: 1.18,
      centerZ: -0.48,
      coilRadius: 0.24,
      wireRadius: 0.045,
      coils: 20,
    }),
    '#9aa8ba'
  );
  const springR = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 2.46,
      end: 14.32,
      centerY: 1.18,
      centerZ: 0.48,
      coilRadius: 0.24,
      wireRadius: 0.045,
      coils: 20,
    }),
    '#9aa8ba'
  );
  return mergeParts([springL, springR]);
}
