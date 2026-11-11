import * as THREE from 'three';
import {
  csgSubtract,
  createRectangularMagSpring,
  mergeParts,
  paintGeometry,
} from './springHelper';
import { applyMagAtlasUVs } from './uvAtlasHelper';

/**
 * M-01: Realistic Steel-Lined Polymer Double-Stack Magazine Body
 * Features rounded-corner double-stack cross-section, visible stainless-steel inner feed-lip liner,
 * magazine catch notch, flared floor-plate rails & rear witness holes.
 */
export function buildMagBodyGeometry(): THREE.BufferGeometry {
  const MAG_POLYMER = '#21252d';
  const MAG_RECESS = '#15181e';
  const STEEL_LINER = '#e2e8f0';

  // Rounded-rectangle cross-section in (X, Z) extruded along local Y (-4.75 to +4.75)
  const rx = 1.31;
  const rz = 0.86;
  const cr = 0.24;
  const sec = new THREE.Shape();
  sec.moveTo(-rx + cr, -rz);
  sec.lineTo(rx - cr, -rz);
  sec.quadraticCurveTo(rx, -rz, rx, -rz + cr);
  sec.lineTo(rx, rz - cr);
  sec.quadraticCurveTo(rx, rz, rx - cr, rz);
  sec.lineTo(-rx + cr, rz);
  sec.quadraticCurveTo(-rx, rz, -rx, rz - cr);
  sec.lineTo(-rx, -rz + cr);
  sec.quadraticCurveTo(-rx, -rz, -rx + cr, -rz);
  sec.closePath();

  const outerTube = new THREE.ExtrudeGeometry(sec, {
    depth: 9.5,
    bevelEnabled: false,
    curveSegments: 10,
  });
  outerTube.rotateX(-Math.PI / 2);
  outerTube.translate(0, -4.75, 0);
  paintGeometry(outerTube, MAG_POLYMER);

  // Tapered upper polymer collar
  const topTaper = paintGeometry(
    new THREE.CylinderGeometry(0.72, 1.14, 0.88, 16)
      .scale(1.52, 1, 0.96)
      .translate(0, 5.05, 0),
    MAG_POLYMER
  );

  // Bottom floor-plate slide-on retention flange rails
  const baseRails = paintGeometry(
    new THREE.BoxGeometry(2.68, 0.16, 1.84).translate(0, -4.68, 0),
    MAG_RECESS
  );

  // Gleaming Stainless-Steel Inner Liner & Double-Stack-to-Single-Feed Lips!
  const steelLinerTube = paintGeometry(
    new THREE.BoxGeometry(2.26, 10.15, 1.42).translate(0, 0.35, 0),
    STEEL_LINER
  );
  const feedLipL = paintGeometry(
    new THREE.BoxGeometry(1.95, 0.36, 0.14)
      .rotateX(0.32)
      .translate(0.08, 5.48, -0.44),
    STEEL_LINER
  );
  const feedLipR = paintGeometry(
    new THREE.BoxGeometry(1.95, 0.36, 0.14)
      .rotateX(-0.32)
      .translate(0.08, 5.48, 0.44),
    STEEL_LINER
  );

  const solidMag = mergeParts([
    outerTube,
    topTaper,
    baseRails,
    steelLinerTube,
    feedLipL,
    feedLipR,
  ]);

  const cutters: THREE.BufferGeometry[] = [];

  // Hollow internal cartridge column
  const innerCavity = paintGeometry(
    new THREE.BoxGeometry(2.12, 10.9, 1.28).translate(0, -0.1, 0),
    '#1e242d'
  );
  cutters.push(innerCavity);

  // Top single-feed opening between steel feed lips
  const feedOpening = paintGeometry(
    new THREE.BoxGeometry(2.1, 1.25, 0.72).translate(0.15, 5.3, 0),
    '#1e242d'
  );
  cutters.push(feedOpening);

  // Right-front Magazine Catch locking notch + left-front ambidextrous notch
  const catchNotchR = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.36, 0.36).translate(1.18, 2.35, 0.8),
    MAG_RECESS
  );
  cutters.push(catchNotchR);

  const catchNotchL = paintGeometry(
    new THREE.BoxGeometry(0.42, 0.36, 0.36).translate(1.18, 2.35, -0.8),
    MAG_RECESS
  );
  cutters.push(catchNotchL);

  // Molded side recessed grip grooves near bottom for magazine extraction
  for (const sign of [-1, 1]) {
    const gripGroove = paintGeometry(
      new THREE.BoxGeometry(1.65, 1.1, 0.14).translate(0, -3.85, sign * 0.86),
      MAG_RECESS
    );
    cutters.push(gripGroove);
  }

  // Rear round-count witness holes revealing gleaming steel liner inside!
  for (let i = 0; i < 6; i++) {
    const wy = 2.4 - i * 1.15;
    const hole = paintGeometry(
      new THREE.CylinderGeometry(0.11, 0.11, 0.28, 14)
        .rotateZ(Math.PI / 2)
        .translate(-1.26, wy, (i % 2 === 0 ? 1 : -1) * 0.15),
      STEEL_LINER
    );
    cutters.push(hole);
  }

  return applyMagAtlasUVs(csgSubtract(solidMag, cutters));
}

/** M-02: High-Visibility Stepped Orange Polymer Magazine Follower */
export function buildMagFollowerGeometry(): THREE.BufferGeometry {
  const base = paintGeometry(
    new THREE.BoxGeometry(2.12, 0.5, 1.26),
    '#f97316'
  );

  const ridge = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 2.06, 18)
      .rotateZ(Math.PI / 2 + 0.12)
      .scale(1, 0.85, 0.9)
      .translate(0, 0.26, 0.26),
    '#fb923c'
  );

  const stopLedge = paintGeometry(
    new THREE.BoxGeometry(0.58, 0.28, 0.26).translate(0.68, 0.22, -0.66),
    '#ea580c'
  );

  const skirtF = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.65, 1.12).translate(0.88, -0.45, 0),
    '#ea580c'
  );
  const skirtR = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.65, 1.12).translate(-0.88, -0.45, 0),
    '#ea580c'
  );

  return mergeParts([base, ridge, stopLedge, skirtF, skirtR]);
}

/** M-03: Tempered Rectangular Coil Magazine Spring */
export function buildMagSpringGeometry(): THREE.BufferGeometry {
  return paintGeometry(
    createRectangularMagSpring({
      height: 7.3,
      widthX: 1.92,
      depthZ: 1.15,
      wireRadius: 0.058,
      coils: 9,
    }),
    '#9aa8ba'
  );
}

/** M-04: Ergonomic Flared Magazine Floor Plate & Locking Insert */
export function buildMagBasePlateGeometry(): THREE.BufferGeometry {
  const plateShape = new THREE.Shape();
  plateShape.moveTo(-1.46, -0.26);
  plateShape.lineTo(1.62, -0.26);
  plateShape.quadraticCurveTo(1.68, 0.05, 1.42, 0.24);
  plateShape.lineTo(-1.38, 0.24);
  plateShape.quadraticCurveTo(-1.52, 0.02, -1.46, -0.26);
  plateShape.closePath();

  const outerPad = new THREE.ExtrudeGeometry(plateShape, {
    depth: 1.98,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 3,
  });
  outerPad.translate(0, 0, -0.99);
  paintGeometry(outerPad, '#1f232b');

  const insert = paintGeometry(
    new THREE.BoxGeometry(2.14, 0.24, 1.3).translate(0, 0.34, 0),
    '#2c323e'
  );

  const lockStud = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 0.34, 18).translate(0, -0.16, 0),
    '#64748b'
  );

  return mergeParts([outerPad, insert, lockStud]);
}
