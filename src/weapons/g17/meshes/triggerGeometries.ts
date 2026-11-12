import * as THREE from 'three';
import {
  csgSubtract,
  createHelicalSpring,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';

/**
 * T-01: 1:1 Safe Action Trigger w/ Safety Blade, Shark-Fin Plunger Lifter & Cruciform Sear Bar
 * Shark-fin is aligned directly on Z = +0.28, Y_peak = 1.43 to cam U-10 Firing Pin Safety Plunger,
 * while rear Cruciform engages T-02 drop-safety shelf, U-08 striker lug, and T-03 connector ramp.
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
  paintGeometry(rawShoe, '#313640');

  const bladeSlot = paintGeometry(
    new THREE.BoxGeometry(0.95, 1.95, 0.18).translate(0.05, -1.25, 0),
    '#242830'
  );
  const pinBore = paintGeometry(
    new THREE.CylinderGeometry(0.195, 0.195, 0.85, 18)
      .rotateX(Math.PI / 2)
      .translate(0, 0.15, 0),
    '#242830'
  );
  const slottedShoe = csgSubtract(rawShoe, [bladeSlot, pinBore]);

  // Safe Action #1: Inner Trigger Safety Blade + Rear Frame-Blocking Stop Tab
  const safetyBladeShape = new THREE.Shape();
  safetyBladeShape.moveTo(0.05, -0.52);
  safetyBladeShape.quadraticCurveTo(0.48, -1.05, 0.34, -1.78);
  safetyBladeShape.lineTo(0.18, -2.02);
  safetyBladeShape.lineTo(-0.24, -1.72);
  safetyBladeShape.lineTo(-0.34, -0.62);
  safetyBladeShape.closePath();
  const safetyBlade = new THREE.ExtrudeGeometry(safetyBladeShape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 1,
  });
  safetyBlade.translate(0, 0, -0.06);
  paintGeometry(safetyBlade, '#586476');

  // 2. Stamped Stainless-Steel Trigger Bar + Plunger-Aligned Shark Fin + Cruciform Plate
  const STEEL_BAR = '#dce4ee';

  const armFront = paintGeometry(
    new THREE.BoxGeometry(0.46, 0.54, 0.1).translate(0.02, 0.42, 0.46),
    STEEL_BAR
  );
  const frontOffsetBend = paintGeometry(
    new THREE.BoxGeometry(0.32, 0.26, 0.28).translate(-0.14, 0.62, 0.56),
    STEEL_BAR
  );

  const mainBar = paintGeometry(
    new THREE.BoxGeometry(5.35, 0.28, 0.09).translate(-2.65, 0.72, 0.66),
    STEEL_BAR
  );

  // Safe Action #2: Vertical Cam Extension ("Bird's Head / Shark Fin") aligned on Z = +0.28!
  const finShape = new THREE.Shape();
  finShape.moveTo(-2.46, 0.76);
  finShape.lineTo(-1.52, 0.76);
  finShape.lineTo(-1.68, 1.34);
  finShape.quadraticCurveTo(-1.92, 1.45, -2.14, 1.41);
  finShape.lineTo(-2.38, 1.12);
  finShape.closePath();
  const fin = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.11,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 1,
  });
  fin.translate(0, 0, 0.225); // Centers fin at Z = +0.28 matching firing_pin_safety!
  paintGeometry(fin, '#f1f5f9');

  const finBridge = paintGeometry(
    new THREE.BoxGeometry(0.82, 0.14, 0.42).translate(-1.98, 0.78, 0.47),
    STEEL_BAR
  );

  // Safe Action #3: Rear Cruciform Cross-Plate, Right Connector Cam Ear & Upward Sear Tab
  const cruciformCross = paintGeometry(
    new THREE.BoxGeometry(0.68, 0.1, 1.18).translate(-5.28, 0.86, 0.22),
    STEEL_BAR
  );
  const connectorCamEar = paintGeometry(
    new THREE.CylinderGeometry(0.06, 0.06, 0.24, 14)
      .rotateX(Math.PI / 2)
      .translate(-5.48, 0.88, 0.81),
    '#f1f5f9'
  );
  const cruciformSpine = paintGeometry(
    new THREE.BoxGeometry(1.12, 0.11, 0.32).translate(-5.25, 0.86, 0),
    STEEL_BAR
  );

  // Upward-bent striker sear engagement tab (catches striker bottom lug at X = -5.18)
  const searTab = paintGeometry(
    new THREE.BoxGeometry(0.14, 0.38, 0.28)
      .rotateZ(-0.18)
      .translate(-5.22, 1.04, 0),
    '#f1f5f9'
  );

  // Downward S-spring hook leg with stamped eyelet
  const rawHookLeg = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.52, 0.11).translate(-5.24, 0.56, 0.12),
    STEEL_BAR
  );
  const hookEye = paintGeometry(
    new THREE.CylinderGeometry(0.055, 0.055, 0.24, 12)
      .rotateX(Math.PI / 2)
      .translate(-5.24, 0.4, 0.12),
    '#475569'
  );
  const hookLeg = csgSubtract(rawHookLeg, [hookEye]);

  return mergeParts([
    slottedShoe,
    safetyBlade,
    armFront,
    frontOffsetBend,
    mainBar,
    fin,
    finBridge,
    cruciformCross,
    connectorCamEar,
    cruciformSpine,
    searTab,
    hookLeg,
  ]);
}

/** T-02: Polymer Trigger Mechanism Housing w/ Drop-Safety Shelves & Bent 9mm (#336) Steel Ejector */
export function buildTriggerHousingGeometry(): THREE.BufferGeometry {
  const blockShape = new THREE.Shape();
  blockShape.moveTo(-6.38, -0.62);
  blockShape.lineTo(-4.62, -0.52);
  blockShape.lineTo(-4.58, 0.84);
  blockShape.lineTo(-6.18, 0.84);
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
  paintGeometry(rawBlock, '#313640');

  const innerSlot = paintGeometry(
    new THREE.BoxGeometry(1.65, 0.98, 0.68).translate(-5.42, 0.38, 0.05),
    '#242830'
  );
  // Right-flank connector seating mortise
  const connectorMortise = paintGeometry(
    new THREE.BoxGeometry(1.02, 1.28, 0.12).translate(-5.32, 0.28, 0.64),
    '#242830'
  );
  const pinHole = paintGeometry(
    new THREE.CylinderGeometry(0.16, 0.16, 1.6, 18)
      .rotateX(Math.PI / 2)
      .translate(-5.65, 0.1, 0),
    '#272b34'
  );

  const housingBody = csgSubtract(rawBlock, [
    innerSlot,
    connectorMortise,
    pinHole,
  ]);

  // Authentic Stamped & Inward-Bent Flat-Blade 9x19mm (#336) Stainless Ejector
  const ejBase = paintGeometry(
    new THREE.BoxGeometry(1.05, 0.28, 0.08).translate(-4.72, 1.04, -0.38),
    '#dce4ee'
  );
  const ejRiser = paintGeometry(
    new THREE.BoxGeometry(0.95, 0.32, 0.08)
      .rotateZ(0.42)
      .translate(-4.02, 1.34, -0.36),
    '#e2e8f0'
  );
  // Inward-bent 8° forward ejector tip riding inside slide left ejector groove (Z = -0.34 -> -0.24)
  const ejTip = paintGeometry(
    new THREE.BoxGeometry(1.18, 0.22, 0.075)
      .rotateY(-0.11)
      .translate(-3.12, 1.56, -0.29),
    '#f1f5f9'
  );

  return mergeParts([housingBody, ejBase, ejRiser, ejTip]);
}

/** T-03: Stamped Stainless Steel 5.5 lb Connector w/ Precision 32° Cam Lip & Disconnector Bump */
export function buildConnectorGeometry(): THREE.BufferGeometry {
  const stem = paintGeometry(
    new THREE.BoxGeometry(0.32, 1.34, 0.075)
      .rotateX(-0.04)
      .translate(-5.62, 0.28, 0.74),
    '#dce4ee'
  );
  const bottomHook = paintGeometry(
    new THREE.BoxGeometry(0.28, 0.14, 0.18).translate(-5.62, -0.36, 0.67),
    '#cbd5e1'
  );

  const arm = paintGeometry(
    new THREE.BoxGeometry(0.98, 0.34, 0.075).translate(-5.28, 0.78, 0.76),
    '#dce4ee'
  );

  // Precision 32° downward cam ramp guiding cruciform ear below striker lug
  const camLip = paintGeometry(
    new THREE.BoxGeometry(0.38, 0.15, 0.22)
      .rotateZ(0.56)
      .rotateX(0.45)
      .translate(-5.58, 0.94, 0.82),
    '#f1f5f9'
  );

  // Upper semi-automatic disconnector lobe cammed inward (-Z) by recoiling slide rail
  const disconnectorBump = paintGeometry(
    new THREE.BoxGeometry(0.24, 0.36, 0.15)
      .rotateZ(-0.12)
      .translate(-4.94, 1.08, 0.81),
    '#f1f5f9'
  );

  return mergeParts([stem, bottomHook, arm, camLip, disconnectorBump]);
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
