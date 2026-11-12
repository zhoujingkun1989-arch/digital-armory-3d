import * as THREE from 'three';
import {
  csgSubtract,
  createRectangularMagSpring,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import { applyMagAtlasUVs } from './uvAtlasHelper';

/**
 * M-01: 1:1 Gen3 Glock 17 Steel-Lined Polymer Double-Stack 17-Rd Magazine Body
 * Features rounded-corner double-stack cross-section, full stainless-steel inner liner,
 * sculpted double-stack-to-single-feed stamped steel feed lips w/ front ogive ramp & rear ejector slot,
 * exposed steel catch notches, and 6 staggered rear witness holes (4..17) aligned 1:1 with PBR atlas.
 */
export function buildMagBodyGeometry(): THREE.BufferGeometry {
  const MAG_POLYMER = '#313640';
  const MAG_RECESS = '#242830';
  const STEEL_LINER = '#e2e8f0'; // cr > 0.5 -> 'steel' UV region

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

  // Tapered upper polymer collar transitioning to exposed stamped steel feed lips
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

  // Full Hardened Stainless-Steel Inner Liner & Stamped Double-Stack-to-Single-Feed Lips
  const steelLinerTube = paintGeometry(
    new THREE.BoxGeometry(2.26, 10.22, 1.44).translate(0, 0.36, 0),
    STEEL_LINER
  );
  const feedLipL = paintGeometry(
    new THREE.BoxGeometry(2.04, 0.38, 0.14)
      .rotateX(0.34)
      .translate(0.05, 5.48, -0.43),
    STEEL_LINER
  );
  const feedLipR = paintGeometry(
    new THREE.BoxGeometry(2.04, 0.38, 0.14)
      .rotateX(-0.34)
      .translate(0.05, 5.48, 0.43),
    STEEL_LINER
  );
  const rearRimBackstop = paintGeometry(
    new THREE.BoxGeometry(0.16, 0.42, 0.96).translate(-0.96, 5.38, 0),
    STEEL_LINER
  );

  const solidMag = mergeParts([
    outerTube,
    topTaper,
    baseRails,
    steelLinerTube,
    feedLipL,
    feedLipR,
    rearRimBackstop,
  ]);

  const cutters: THREE.BufferGeometry[] = [];

  // Hollow internal double-stack cartridge column
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(2.1, 10.95, 1.28).translate(0, -0.1, 0),
      '#1e242d'
    )
  );

  // Top single-feed presentation slot + front semicircular bullet-ogive clearance scoop + rear ejector cut
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(2.05, 1.25, 0.68).translate(0.16, 5.32, 0),
      '#1e242d'
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.CylinderGeometry(0.52, 0.52, 0.85, 18).translate(1.06, 5.38, 0),
      '#1e242d'
    )
  );
  cutters.push(
    paintGeometry(
      new THREE.BoxGeometry(0.52, 0.52, 0.24).translate(-0.96, 5.45, -0.26),
      '#1e242d'
    )
  );

  // Ambidextrous Gen3/4 Polymer Cutouts exposing stainless steel catch shelves at X = 1.18, Y = 2.35
  for (const sign of [-1, 1]) {
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(0.46, 0.38, 0.24).translate(
          1.16,
          2.35,
          sign * 0.82
        ),
        STEEL_LINER
      )
    );
    cutters.push(
      paintGeometry(
        new THREE.BoxGeometry(1.65, 1.1, 0.14).translate(0, -3.85, sign * 0.86),
        MAG_RECESS
      )
    );
  }

  // 6 Staggered Rear Witness Holes (4, 6, 8, 10, 12, 17):
  // Stepped polymer counterbore + inner punched through-hole into cartridge column at exact PBR coords!
  for (let i = 0; i < 6; i++) {
    const wy = 2.4 - i * 1.15;
    const wz = (i % 2 === 0 ? 1 : -1) * 0.15;
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.11, 0.11, 0.26, 14)
          .rotateZ(Math.PI / 2)
          .translate(-1.26, wy, wz),
        STEEL_LINER
      )
    );
    cutters.push(
      paintGeometry(
        new THREE.CylinderGeometry(0.076, 0.076, 0.34, 14)
          .rotateZ(Math.PI / 2)
          .translate(-1.12, wy, wz),
        '#1e242d'
      )
    );
  }

  return applyMagAtlasUVs(csgSubtract(solidMag, cutters));
}

/** M-02: High-Visibility Stepped Orange Polymer Magazine Follower */
export function buildMagFollowerGeometry(): THREE.BufferGeometry {
  const base = paintGeometry(
    new THREE.BoxGeometry(2.1, 0.48, 1.25),
    '#f97316'
  );

  // Stepped cartridge-staggering upper rib
  const ridge = paintGeometry(
    new THREE.CylinderGeometry(0.32, 0.32, 2.04, 18)
      .rotateZ(Math.PI / 2 + 0.12)
      .scale(1, 0.85, 0.9)
      .translate(0, 0.26, 0.26),
    '#fb923c'
  );

  // Left-front slide-stop lever actuator shelf
  const stopLedge = paintGeometry(
    new THREE.BoxGeometry(0.58, 0.3, 0.26).translate(0.68, 0.24, -0.65),
    '#ea580c'
  );

  const skirtF = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.68, 1.12).translate(0.88, -0.46, 0),
    '#ea580c'
  );
  const skirtR = paintGeometry(
    new THREE.BoxGeometry(0.22, 0.68, 1.12).translate(-0.88, -0.46, 0),
    '#ea580c'
  );

  return mergeParts([base, ridge, stopLedge, skirtF, skirtR]);
}

/** M-03: Tempered Rectangular Coil Magazine Spring */
export function buildMagSpringGeometry(): THREE.BufferGeometry {
  return paintGeometry(
    createRectangularMagSpring({
      height: 6.5,
      widthX: 1.92,
      depthZ: 1.15,
      wireRadius: 0.058,
      coils: 9,
    }),
    '#9aa8ba'
  );
}

/** M-04: Ergonomic Flared Magazine Floor Plate & Locking Insert w/ Detent Hole */
export function buildMagBasePlateGeometry(): THREE.BufferGeometry {
  const plateShape = new THREE.Shape();
  plateShape.moveTo(-1.46, -0.26);
  plateShape.lineTo(1.62, -0.26);
  plateShape.quadraticCurveTo(1.68, 0.05, 1.42, 0.24);
  plateShape.lineTo(-1.38, 0.24);
  plateShape.quadraticCurveTo(-1.52, 0.02, -1.46, -0.26);
  plateShape.closePath();

  const rawOuterPad = new THREE.ExtrudeGeometry(plateShape, {
    depth: 1.98,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 3,
  });
  rawOuterPad.translate(0, 0, -0.99);
  paintGeometry(rawOuterPad, '#313640');

  // Center punch disassembly hole in outer floorplate
  const punchHole = paintGeometry(
    new THREE.CylinderGeometry(0.2, 0.2, 0.36, 18).translate(0, -0.2, 0),
    '#242830'
  );
  const outerPad = csgSubtract(rawOuterPad, [punchHole]);

  const insert = paintGeometry(
    new THREE.BoxGeometry(2.08, 0.24, 1.26).translate(0, 0.34, 0),
    '#3b4452'
  );

  // Locking stud snapping flush into outer floorplate hole
  const lockStud = paintGeometry(
    new THREE.CylinderGeometry(0.18, 0.18, 0.36, 18).translate(0, -0.14, 0),
    '#64748b'
  );

  return mergeParts([outerPad, insert, lockStud]);
}
