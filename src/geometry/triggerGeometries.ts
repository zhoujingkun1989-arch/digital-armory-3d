import * as THREE from 'three';
import {
  csgSubtract,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from './springHelper';

/**
 * T-01: Realistic Multi-Material Safe Action Trigger Assembly
 * Combines curved matte-polymer trigger shoe, distinct inner safety blade & stamped stainless-steel trigger bar!
 */
export function buildTriggerWithBarGeometry(): THREE.BufferGeometry {
  // 1. Ergonomically curved polymer Trigger Shoe (pivots around [0, 0.15, 0])
  const shoeShape = new THREE.Shape();
  shoeShape.moveTo(-0.32, 0.38);
  shoeShape.lineTo(0.28, 0.38);
  shoeShape.bezierCurveTo(0.36, -0.35, 0.34, -1.15, 0.12, -1.78);
  shoeShape.quadraticCurveTo(-0.04, -2.28, -0.28, -2.26);
  shoeShape.quadraticCurveTo(-0.48, -2.22, -0.38, -1.86);
  shoeShape.bezierCurveTo(-0.18, -1.25, -0.22, -0.55, -0.32, 0.38);
  shoeShape.closePath();

  const rawShoe = new THREE.ExtrudeGeometry(shoeShape, {
    depth: 0.62,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
    curveSegments: 14,
  });
  rawShoe.translate(0, 0, -0.31);
  paintGeometry(rawShoe, '#20242c');

  const bladeSlot = paintGeometry(
    new THREE.BoxGeometry(0.95, 1.95, 0.18).translate(0.05, -1.25, 0),
    '#14171d'
  );
  const pinBore = paintGeometry(
    new THREE.CylinderGeometry(0.19, 0.19, 0.85, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0.15, 0),
    '#14171d'
  );
  const slottedShoe = csgSubtract(rawShoe, [bladeSlot, pinBore]);

  // Contrasting Inner Trigger Safety Blade (Safe Action #1!)
  const safetyBladeShape = new THREE.Shape();
  safetyBladeShape.moveTo(0.05, -0.52);
  safetyBladeShape.quadraticCurveTo(0.48, -1.05, 0.34, -1.78);
  safetyBladeShape.lineTo(0.18, -2.02);
  safetyBladeShape.lineTo(-0.05, -1.85);
  safetyBladeShape.closePath();
  const safetyBlade = new THREE.ExtrudeGeometry(safetyBladeShape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 1,
  });
  safetyBlade.translate(0, 0, -0.06);
  paintGeometry(safetyBlade, '#465264');

  // 2. Bright Stamped Stainless-Steel Trigger Bar + Shark Fin + Rear Cruciform
  const STEEL_BAR = '#dce4ee';

  const armFront = paintGeometry(
    new THREE.BoxGeometry(0.45, 0.52, 0.1).translate(0.02, 0.42, 0.46),
    STEEL_BAR
  );

  const mainBar = paintGeometry(
    new THREE.BoxGeometry(5.35, 0.28, 0.09).translate(-2.65, 0.72, 0.66),
    STEEL_BAR
  );

  const finShape = new THREE.Shape();
  finShape.moveTo(-2.42, 0.72);
  finShape.lineTo(-1.55, 0.72);
  finShape.lineTo(-1.72, 1.28);
  finShape.quadraticCurveTo(-1.92, 1.38, -2.12, 1.34);
  finShape.lineTo(-2.34, 1.06);
  finShape.closePath();
  const fin = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.11,
    bevelEnabled: false,
  });
  fin.translate(0, 0, 0.34);
  paintGeometry(fin, STEEL_BAR);

  const finBridge = paintGeometry(
    new THREE.BoxGeometry(0.75, 0.16, 0.34).translate(-1.98, 0.78, 0.52),
    STEEL_BAR
  );

  const cruciformCross = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.1, 1.14).translate(-5.28, 0.86, 0.21),
    STEEL_BAR
  );

  const cruciformSpine = paintGeometry(
    new THREE.BoxGeometry(1.08, 0.11, 0.32).translate(-5.25, 0.86, 0),
    STEEL_BAR
  );

  const searTab = paintGeometry(
    new THREE.BoxGeometry(0.14, 0.36, 0.28)
      .rotateZ(-0.18)
      .translate(-5.22, 1.03, 0),
    '#f1f5f9'
  );

  const hookLeg = paintGeometry(
    new THREE.BoxGeometry(0.18, 0.48, 0.12).translate(-5.22, 0.58, 0.12),
    STEEL_BAR
  );

  return mergeParts([
    slottedShoe,
    safetyBlade,
    armFront,
    mainBar,
    fin,
    finBridge,
    cruciformCross,
    cruciformSpine,
    searTab,
    hookLeg,
  ]);
}

/** T-02: Two-Tone Polymer Trigger Housing + Gleaming Bent Stainless-Steel Ejector */
export function buildTriggerHousingGeometry(): THREE.BufferGeometry {
  const blockShape = new THREE.Shape();
  blockShape.moveTo(-6.38, -0.62);
  blockShape.lineTo(-4.62, -0.52);
  blockShape.lineTo(-4.58, 0.82);
  blockShape.lineTo(-6.18, 0.82);
  blockShape.lineTo(-6.45, 0.25);
  blockShape.closePath();

  const rawBlock = new THREE.ExtrudeGeometry(blockShape, {
    depth: 1.28,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  rawBlock.translate(0, 0, -0.64);
  paintGeometry(rawBlock, '#222730');

  const innerSlot = paintGeometry(
    new THREE.BoxGeometry(1.65, 0.98, 0.68).translate(-5.42, 0.38, 0.05),
    '#161920'
  );

  const pinHole = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 1.6, 18)
      .rotateX(Math.PI / 2)
      .translate(-5.65, 0.1, 0),
    '#21262e'
  );

  const housingBody = csgSubtract(rawBlock, [innerSlot, pinHole]);

  // Stamped & Bent Stainless-Steel Ejector Blade!
  const ejectorCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-5.15, 0.82, -0.46),
    new THREE.Vector3(-4.45, 1.12, -0.44),
    new THREE.Vector3(-3.65, 1.16, -0.34),
    new THREE.Vector3(-2.92, 1.16, -0.22),
  ]);
  const ejector = paintGeometry(
    new THREE.TubeGeometry(ejectorCurve, 18, 0.072, 8, false),
    '#e2e8f0'
  );

  return mergeParts([housingBody, ejector]);
}

/** T-03: Stamped Stainless Steel Connector */
export function buildConnectorGeometry(): THREE.BufferGeometry {
  const stem = paintGeometry(
    new THREE.BoxGeometry(0.32, 1.32, 0.08).translate(-5.62, 0.28, 0.74),
    '#dce4ee'
  );

  const arm = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.34, 0.08).translate(-5.28, 0.78, 0.74),
    '#dce4ee'
  );

  const camLip = paintGeometry(
    new THREE.BoxGeometry(0.36, 0.16, 0.22)
      .rotateX(0.68)
      .translate(-5.62, 0.94, 0.81),
    '#f1f5f9'
  );

  const disconnectorBump = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.32, 0.14).translate(-4.95, 1.04, 0.8),
    '#f1f5f9'
  );

  return mergeParts([stem, arm, camLip, disconnectorBump]);
}

/** T-04: Tempered Trigger Coil Tension Spring with S-Hooks */
export function buildTriggerSpringGeometry(): THREE.BufferGeometry {
  const coil = createHelicalSpring({
    axis: 'x',
    start: -6.02,
    end: -5.42,
    centerY: 0.38,
    centerZ: 0.12,
    coilRadius: 0.13,
    wireRadius: 0.028,
    coils: 8,
  });

  const frontHook = new THREE.TorusGeometry(0.09, 0.026, 8, 16, Math.PI * 1.4);
  frontHook.translate(-5.32, 0.38, 0.12);

  const rearHook = new THREE.TorusGeometry(0.09, 0.026, 8, 16, Math.PI * 1.4);
  rearHook.rotateZ(Math.PI);
  rearHook.translate(-6.12, 0.38, 0.12);

  return paintGeometry(mergeParts([coil, frontHook, rearHook]), '#9aa8ba');
}
