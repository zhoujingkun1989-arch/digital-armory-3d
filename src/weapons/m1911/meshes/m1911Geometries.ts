import * as THREE from 'three';
import {
  createBeveledCylinder,
  createChamferedBox,
  createHelicalSpring,
  createRifledBarrelBoreCutter,
  csgSubtract,
  mergeParts,
  paintGeometry,
} from '../../../engine/geometry/csgBuilder';
import {
  extrudeAlongZ,
  mergeCutters,
  revolveClosedX,
  sanitizeWeaponMesh,
} from '../../../engine/geometry/meshSanitizer';

// ============================================================================
// 1:1 COLT M1911A1 U.S. ARMY (.45 ACP) METRIC CAD CONSTANTS
// Scale: 1 world unit = 1 cm = 10 mm (+X muzzle, +Y up, +Z right flank)
// OAL = 21.60 cm (X in [-10.00, +11.60]), 5.03" Barrel = 12.78 cm (X in [-1.18, +11.60]),
// Bore Axis Y = +2.55 cm, Browning Ergonomic Grip Angle = 18 deg from vertical (72 deg from horizontal).
// ============================================================================

export const M1911_BORE_Y = 2.55;
export const M1911_GRIP_ANGLE_RAD = (-18 * Math.PI) / 180;
export const M1911_GRIP_SPRING_ROT_Z = (72 * Math.PI) / 180;

/** Fixed slide-stop cross-pin pivot axis in frame (X, Y) */
export const M1911_LINK_PIVOT_X = 0.46;
export const M1911_LINK_PIVOT_Y = 0.65;
/** Barrel upper link-pin center at battery (0.278" = 0.7058 cm center-to-center link) */
export const M1911_BARREL_LUG_PIN_X0 = 0.55;
export const M1911_BARREL_LUG_PIN_Y0 = 1.35;
export const M1911_LINK_LEN = Math.hypot(
  M1911_BARREL_LUG_PIN_X0 - M1911_LINK_PIVOT_X,
  M1911_BARREL_LUG_PIN_Y0 - M1911_LINK_PIVOT_Y
);
/** Initial link angle from +Y toward -X at battery (-7.33 deg leaning slightly forward) */
export const M1911_LINK_ALPHA0 = Math.atan2(
  -(M1911_BARREL_LUG_PIN_X0 - M1911_LINK_PIVOT_X),
  M1911_BARREL_LUG_PIN_Y0 - M1911_LINK_PIVOT_Y
);

// Authentic WWII Parkerized Ordnance Steel & Double-Diamond Walnut Palette
// (All vertex colors strictly >= 0.018 linear luminance floor)
export const M1911_PARKERIZED = '#3a414c';
export const M1911_BLUED_STEEL = '#2e3644';
export const M1911_POLISHED_STEEL = '#bcc6d4';
export const M1911_STAINLESS = '#d2dae6';
export const M1911_SPRING_STEEL = '#94a3b8';
export const M1911_WALNUT = '#72462a';
export const M1911_BRASS_ESCUTCHEON = '#cca04c';

// U-01: Parkerized Steel Slide w/ Rounded Arch, Ejection Port & Rear Serrations (`assembledPos: [0, 0, 0]`)
export function buildM1911SlideGeometry(): THREE.BufferGeometry {
  // Flat slab sides (Y in [1.10, 2.55]) + iconic semicircular top arch (r = 1.17 centered at Y = 2.55)
  const body = createChamferedBox(19.1, 1.52, 2.34, 0.06, M1911_PARKERIZED);
  body.translate(1.75, 1.84, 0);

  const arch = createBeveledCylinder(1.17, 1.17, 19.1, 0.05, 28, M1911_PARKERIZED);
  arch.rotateZ(Math.PI / 2);
  arch.translate(1.75, M1911_BORE_Y, 0);

  // Scalloped front dust-cover recoil spring tunnel (X in [2.1, 11.3], Y in [0.78, 1.60])
  const recoilTunnel = createBeveledCylinder(0.74, 0.74, 9.2, 0.04, 22, M1911_PARKERIZED);
  recoilTunnel.rotateZ(Math.PI / 2);
  recoilTunnel.translate(6.7, 1.3, 0);

  // Fixed military ramp front sight blade + GI rear dovetail notch sight
  const frontSight = createChamferedBox(1.15, 0.44, 0.24, 0.02, M1911_BLUED_STEEL);
  frontSight.translate(10.35, 3.84, 0);

  const rearSight = createChamferedBox(0.95, 0.46, 1.32, 0.03, M1911_BLUED_STEEL);
  rearSight.translate(-6.75, 3.84, 0);

  const solid = mergeParts([body, arch, recoilTunnel, frontSight, rearSight]);

  // Cutters: internal barrel/breech channel, ejection port, recoil spring bore, rear sight notch, hammer clearance
  const boreChannel = createBeveledCylinder(0.89, 0.89, 13.6, 0.02, 24, '#242a34');
  boreChannel.rotateZ(Math.PI / 2);
  boreChannel.translate(4.8, M1911_BORE_Y, 0);

  const lowerRailCut = createChamferedBox(17.8, 1.35, 1.56, 0.02, '#242a34');
  lowerRailCut.translate(1.6, 1.52, 0);

  const ejectPort = createChamferedBox(4.05, 1.65, 1.55, 0.03, '#242a34');
  ejectPort.translate(0.95, 3.05, 0.68);

  const recoilBore = createBeveledCylinder(0.56, 0.56, 9.8, 0.02, 18, '#242a34');
  recoilBore.rotateZ(Math.PI / 2);
  recoilBore.translate(6.8, 1.3, 0);

  const rearNotch = createChamferedBox(1.15, 0.36, 0.28, 0.01, '#242a34');
  rearNotch.translate(-6.75, 3.96, 0);

  const fpStopSlot = createChamferedBox(0.45, 1.35, 0.85, 0.01, '#242a34');
  fpStopSlot.translate(-7.72, 2.25, 0);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [
      mergeCutters(
        [boreChannel, lowerRailCut, ejectPort, recoilBore, rearNotch, fpStopSlot],
        '#242a34'
      ),
    ])
  );
}

// U-02: 5.03" .45 ACP Rifled Barrel w/ Dual Top Locking Ribs & Lower Link Lug (`assembledPos: [0, 0, 0]`)
export function buildM1911BarrelGeometry(): THREE.BufferGeometry {
  const barrelTube = revolveClosedX(
    [
      [0.573, -1.18],
      [0.855, -1.18], // Chamber breechface
      [0.855, 1.48],  // Chamber outer body
      [0.755, 1.52],  // Locking-rib neck
      [0.755, 1.58],
      [0.925, 1.60],  // Locking Rib #1
      [0.925, 1.96],
      [0.755, 1.98],
      [0.755, 2.24],
      [0.925, 2.26],  // Locking Rib #2
      [0.925, 2.62],
      [0.735, 2.66],  // Front barrel cylinder
      [0.735, 11.48],
      [0.675, 11.6],  // Crown chamfer
      [0.573, 11.6],
      [0.0, 11.6],
      [0.0, -1.18],
    ],
    32,
    M1911_POLISHED_STEEL
  );
  barrelTube.translate(0, M1911_BORE_Y, 0);

  // Chamber top hood extending rearward to lock against breechface
  const hood = createChamferedBox(1.1, 0.36, 0.92, 0.03, M1911_POLISHED_STEEL);
  hood.translate(-0.72, M1911_BORE_Y + 0.72, 0);

  // Twin lower standing link lugs straddling swinging barrel link
  const lugLeft = createChamferedBox(1.65, 1.05, 0.24, 0.03, M1911_BLUED_STEEL);
  lugLeft.translate(0.55, 1.48, -0.27);
  const lugRight = createChamferedBox(1.65, 1.05, 0.24, 0.03, M1911_BLUED_STEEL);
  lugRight.translate(0.55, 1.48, 0.27);

  const solid = mergeParts([barrelTube, hood, lugLeft, lugRight]);

  // 6-groove left-hand .45 ACP bore cutter + link pin transverse hole
  const rifledBore = createRifledBarrelBoreCutter(13.2, 0.573, 0.018, 6, 1.25);
  rifledBore.translate(5.2, M1911_BORE_Y, 0);

  const linkPinHole = createBeveledCylinder(0.14, 0.14, 1.2, 0.01, 16, '#242a34');
  linkPinHole.rotateX(Math.PI / 2);
  linkPinHole.translate(M1911_BARREL_LUG_PIN_X0, M1911_BARREL_LUG_PIN_Y0, 0);

  return sanitizeWeaponMesh(csgSubtract(solid, [rifledBore, linkPinHole]));
}

// U-03: Browning Single Swinging Barrel Link (`assembledPos: [0.46, 0.65, 0]`, pivot at local (0,0,0))
export function buildM1911BarrelLinkGeometry(): THREE.BufferGeometry {
  const dxUp = M1911_BARREL_LUG_PIN_X0 - M1911_LINK_PIVOT_X; // +0.09
  const dyUp = M1911_BARREL_LUG_PIN_Y0 - M1911_LINK_PIVOT_Y; // +0.70

  const botBoss = createBeveledCylinder(0.32, 0.32, 0.26, 0.025, 22, M1911_POLISHED_STEEL);
  botBoss.rotateX(Math.PI / 2);

  const topBoss = createBeveledCylinder(0.24, 0.24, 0.26, 0.025, 20, M1911_POLISHED_STEEL);
  topBoss.rotateX(Math.PI / 2);
  topBoss.translate(dxUp, dyUp, 0);

  const web = createChamferedBox(0.38, 0.72, 0.24, 0.025, M1911_POLISHED_STEEL);
  web.rotateZ(M1911_LINK_ALPHA0);
  web.translate(dxUp * 0.5, dyUp * 0.5, 0);

  // Upper pin riding inside barrel lugs
  const upperPin = createBeveledCylinder(0.125, 0.125, 0.74, 0.015, 16, M1911_STAINLESS);
  upperPin.rotateX(Math.PI / 2);
  upperPin.translate(dxUp, dyUp, 0);

  const solid = mergeParts([botBoss, topBoss, web, upperPin]);
  const lowerHole = createBeveledCylinder(0.17, 0.17, 0.5, 0.01, 18, '#242a34');
  lowerHole.rotateX(Math.PI / 2);

  return sanitizeWeaponMesh(csgSubtract(solid, [lowerHole]));
}

// U-04: Quarter-Turn Muzzle Barrel Bushing (`assembledPos: [10.65, 2.55, 0]`)
export function buildM1911BarrelBushingGeometry(): THREE.BufferGeometry {
  const collar = createBeveledCylinder(0.96, 0.96, 1.55, 0.04, 28, M1911_PARKERIZED);
  collar.rotateZ(Math.PI / 2);

  const flange = createBeveledCylinder(1.06, 1.06, 0.34, 0.04, 28, M1911_PARKERIZED);
  flange.rotateZ(Math.PI / 2);
  flange.translate(0.66, 0, 0);

  // Iconic crescent lower retaining apron holding the recoil spring plug
  const apron = createChamferedBox(0.32, 1.48, 1.28, 0.04, M1911_PARKERIZED);
  apron.translate(0.66, -0.96, 0);

  const solid = mergeParts([collar, flange, apron]);

  const barrelHole = createBeveledCylinder(0.755, 0.755, 2.2, 0.01, 28, '#242a34');
  barrelHole.rotateZ(Math.PI / 2);

  const plugCutout = createBeveledCylinder(0.42, 0.42, 0.6, 0.01, 20, '#242a34');
  plugCutout.rotateZ(Math.PI / 2);
  plugCutout.translate(0.66, -1.25, 0);

  return sanitizeWeaponMesh(csgSubtract(solid, [barrelHole, plugCutout]));
}

// U-05: Checkered Hollow Recoil Spring Plug (`assembledPos: [9.75, 1.30, 0]`)
export function buildM1911RecoilPlugGeometry(): THREE.BufferGeometry {
  const plug = revolveClosedX(
    [
      [0.44, -1.48],
      [0.54, -1.48],
      [0.54, 1.42],
      [0.48, 1.52],
      [0.0, 1.52],
      [0.0, 1.22],
      [0.44, 1.22],
      [0.44, -1.48],
    ],
    26,
    M1911_BLUED_STEEL
  );
  return sanitizeWeaponMesh(plug);
}

// U-06: Flanged Short Recoil Spring Guide Rod (`assembledPos: [1.95, 1.30, 0]`)
export function buildM1911RecoilGuideGeometry(): THREE.BufferGeometry {
  const rod = revolveClosedX(
    [
      [0.0, -0.24],
      [0.54, -0.24],
      [0.54, 0.1],
      [0.32, 0.14],
      [0.32, 4.18],
      [0.24, 4.3],
      [0.0, 4.3],
    ],
    24,
    M1911_POLISHED_STEEL
  );
  const headPlate = createChamferedBox(0.32, 1.18, 0.96, 0.04, M1911_POLISHED_STEEL);
  headPlate.translate(-0.08, 0.08, 0);
  return sanitizeWeaponMesh(mergeParts([rod, headPlate]));
}

// U-07: Dynamic 16-lb Helical Recoil Spring (`assembledPos: [1.95, 1.30, 0]`, local X in [0.0, 8.95])
export function buildM1911RecoilSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: 8.95,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.41,
      wireRadius: 0.062,
      coils: 22,
      radialSegments: 8,
      stepsPerCoil: 14,
    }),
    M1911_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// U-08: Inertia Firing Pin & Rectangular Stop Plate (`assembledPos: [-4.45, 2.55, 0]`)
export function buildM1911FiringPinGeometry(): THREE.BufferGeometry {
  const pin = revolveClosedX(
    [
      [0.0, -3.45],
      [0.19, -3.45], // Rear striking head
      [0.19, -2.5],
      [0.15, -2.4],
      [0.15, 2.25],
      [0.095, 3.05],
      [0.065, 3.22],
      [0.0, 3.24],
    ],
    18,
    M1911_STAINLESS
  );
  const stopPlate = createChamferedBox(0.28, 1.38, 0.94, 0.03, M1911_BLUED_STEEL);
  stopPlate.translate(-3.18, -0.22, 0);
  return sanitizeWeaponMesh(mergeParts([pin, stopPlate]));
}

// U-09: Internal Spring-Tempered Tubular Claw Extractor (`assembledPos: [-4.10, 2.55, 0.56]`)
export function buildM1911ExtractorGeometry(): THREE.BufferGeometry {
  const shaft = createBeveledCylinder(0.2, 0.2, 6.8, 0.02, 16, M1911_BLUED_STEEL);
  shaft.rotateZ(Math.PI / 2);
  const claw = createChamferedBox(0.95, 0.44, 0.42, 0.03, M1911_BLUED_STEEL);
  claw.translate(3.38, 0.0, -0.14);
  const rearButt = createChamferedBox(0.45, 0.46, 0.36, 0.03, M1911_BLUED_STEEL);
  rearButt.translate(-3.45, 0, 0);
  return sanitizeWeaponMesh(mergeParts([shaft, claw, rearButt]));
}

// F-01: Forged Alloy Steel M1911A1 Frame w/ Closed Trigger Guard & 18° Grip (`assembledPos: [0, 0, 0]`)
export function buildM1911FrameGeometry(): THREE.BufferGeometry {
  // Upper frame rail spine & forward dust cover
  const railSpine = createChamferedBox(16.0, 1.12, 2.18, 0.06, M1911_PARKERIZED);
  railSpine.translate(-0.6, 0.96, 0);

  // Iconic M1911A1 extended tang / beavertail frame horn
  const tang = createChamferedBox(2.2, 0.56, 1.66, 0.06, M1911_PARKERIZED);
  tang.translate(-8.65, 1.12, 0);

  // Solid 18° raked grip frame blank
  const gripBlank = createChamferedBox(4.7, 10.6, 2.14, 0.08, M1911_PARKERIZED);
  gripBlank.rotateZ(M1911_GRIP_ANGLE_RAD);
  gripBlank.translate(-4.95, -3.75, 0);

  // 100% CLOSED solid trigger guard loop (front strut + lower bow + rear root solidly welded to frame!)
  const tgShape = new THREE.Shape();
  tgShape.moveTo(-2.75, 0.85);
  tgShape.lineTo(2.35, 0.85);
  tgShape.lineTo(2.35, -1.78);
  tgShape.lineTo(1.85, -2.28);
  tgShape.lineTo(-2.35, -2.28);
  tgShape.lineTo(-2.85, -1.55);
  tgShape.closePath();
  const tgOuter = extrudeAlongZ(tgShape, 0, 1.18, M1911_PARKERIZED, 0.05, 8);

  const solid = mergeParts([railSpine, tang, gripBlank, tgOuter]);

  // Cutters: trigger guard finger opening, magwell cavity, dust-cover tunnel, slide rail relief, mainspring housing track
  const tgHoleShape = new THREE.Shape();
  tgHoleShape.moveTo(-2.05, 0.42);
  tgHoleShape.lineTo(1.75, 0.42);
  tgHoleShape.lineTo(1.75, -1.42);
  tgHoleShape.lineTo(1.42, -1.76);
  tgHoleShape.lineTo(-1.82, -1.76);
  tgHoleShape.lineTo(-2.15, -1.25);
  tgHoleShape.closePath();
  const tgHole = extrudeAlongZ(tgHoleShape, 0, 1.6, '#242a34', 0.02, 8);

  const magwell = createChamferedBox(3.56, 11.4, 1.48, 0.02, '#242a34');
  magwell.rotateZ(M1911_GRIP_ANGLE_RAD);
  magwell.translate(-4.65, -3.55, 0);

  const dustCut = createBeveledCylinder(0.68, 0.68, 8.2, 0.01, 20, '#242a34');
  dustCut.rotateZ(Math.PI / 2);
  dustCut.translate(4.0, 1.38, 0);

  const mshSlot = createChamferedBox(1.45, 6.6, 1.52, 0.02, '#242a34');
  mshSlot.rotateZ(M1911_GRIP_ANGLE_RAD);
  mshSlot.translate(-7.75, -4.65, 0);

  const ssPinHole = createBeveledCylinder(0.24, 0.24, 2.8, 0.01, 16, '#242a34');
  ssPinHole.rotateX(Math.PI / 2);
  ssPinHole.translate(M1911_LINK_PIVOT_X, M1911_LINK_PIVOT_Y, 0);

  return sanitizeWeaponMesh(
    csgSubtract(solid, [
      mergeCutters([tgHole, magwell, dustCut, mshSlot, ssPinHole], '#242a34'),
    ])
  );
}

// F-02: Left-Side Slide Stop Lever & Barrel Link Cross-Pin (`assembledPos: [0.46, 0.65, 0]`)
export function buildM1911SlideStopGeometry(): THREE.BufferGeometry {
  // Cross-pin passing through frame & swinging barrel link lower eye
  const pin = createBeveledCylinder(0.165, 0.165, 2.38, 0.02, 20, M1911_BLUED_STEEL);
  pin.rotateX(Math.PI / 2);

  // Left-flank external lever arm extending rearward toward thumb
  const armShape = new THREE.Shape();
  armShape.moveTo(-4.15, -0.32);
  armShape.lineTo(0.45, -0.35);
  armShape.lineTo(0.48, 0.36);
  armShape.lineTo(-3.45, 0.56);
  armShape.lineTo(-4.25, 0.28);
  armShape.closePath();
  const arm = extrudeAlongZ(armShape, -1.26, 0.28, M1911_BLUED_STEEL, 0.035, 8);

  const thumbShelf = createChamferedBox(1.15, 0.38, 0.52, 0.03, M1911_BLUED_STEEL);
  thumbShelf.translate(-3.65, 0.22, -1.42);

  return sanitizeWeaponMesh(mergeParts([pin, arm, thumbShelf]));
}

// F-03: Checkered Frame-Mounted Thumb Safety (`assembledPos: [-6.85, 0.72, -1.20]`)
export function buildM1911ThumbSafetyGeometry(): THREE.BufferGeometry {
  const shaft = createBeveledCylinder(0.18, 0.18, 2.35, 0.02, 16, M1911_BLUED_STEEL);
  shaft.rotateX(Math.PI / 2);
  shaft.translate(0, 0, 1.15);

  const shield = createChamferedBox(1.95, 1.05, 0.26, 0.04, M1911_BLUED_STEEL);
  shield.translate(-0.25, 0.15, -0.04);

  const paddle = createChamferedBox(1.35, 0.34, 0.62, 0.04, M1911_BLUED_STEEL);
  paddle.translate(-0.62, 0.42, -0.28);

  return sanitizeWeaponMesh(mergeParts([shaft, shield, paddle]));
}

// F-04: Arched Serrated M1911A1 Mainspring Housing w/ Lanyard Loop (`assembledPos: [-8.40, -4.60, 0]`)
export function buildM1911MainspringHousingGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.52, -3.15);
  s.lineTo(0.75, -3.15);
  s.lineTo(0.75, 3.05);
  s.lineTo(-0.18, 3.05);
  s.lineTo(-0.98, 0.25); // Iconic 1924 M1911A1 arched palm swell!
  s.lineTo(-0.95, -1.85);
  s.closePath();
  const body = extrudeAlongZ(s, 0, 1.62, M1911_PARKERIZED, 0.06, 8);
  body.rotateZ(M1911_GRIP_ANGLE_RAD);

  // Bottom GI lanyard loop
  const loopBase = createChamferedBox(0.72, 0.72, 0.72, 0.05, M1911_BLUED_STEEL);
  loopBase.translate(-0.98, -3.28, 0);

  const solid = mergeParts([body, loopBase]);

  // Internal cylindrical mainspring tunnel
  const springBore = createBeveledCylinder(0.36, 0.36, 5.5, 0.01, 18, '#242a34');
  springBore.rotateZ(M1911_GRIP_ANGLE_RAD);
  springBore.translate(0.12, 0.45, 0);

  return sanitizeWeaponMesh(csgSubtract(solid, [springBore]));
}

// F-05 & F-06: Double-Diamond Checkered American Walnut Grip Panels
function buildM1911GripPanel(sideSign: -1 | 1): THREE.BufferGeometry {
  const panel = createChamferedBox(3.68, 9.55, 0.48, 0.08, M1911_WALNUT);
  panel.rotateZ(M1911_GRIP_ANGLE_RAD);

  // Twin brass/blued slotted grip screw escutcheons
  const topScrew = createBeveledCylinder(0.26, 0.26, 0.54, 0.02, 16, M1911_BRASS_ESCUTCHEON);
  topScrew.rotateX(Math.PI / 2);
  topScrew.translate(1.05, 3.45, sideSign * 0.04);

  const botScrew = createBeveledCylinder(0.26, 0.26, 0.54, 0.02, 16, M1911_BRASS_ESCUTCHEON);
  botScrew.rotateX(Math.PI / 2);
  botScrew.translate(-1.22, -3.55, sideSign * 0.04);

  return sanitizeWeaponMesh(mergeParts([panel, topScrew, botScrew]));
}

export function buildM1911GripLeftGeometry(): THREE.BufferGeometry {
  return buildM1911GripPanel(-1);
}

export function buildM1911GripRightGeometry(): THREE.BufferGeometry {
  return buildM1911GripPanel(1);
}

// FC-01: Exposed Checkered Spur Hammer & Articulated Strut (`assembledPos: [-7.25, 1.15, 0]`)
export function buildM1911HammerGeometry(): THREE.BufferGeometry {
  // Built in ready-to-fire cocked pose (leaning rearward behind slide face X = -7.80)
  const s = new THREE.Shape();
  s.moveTo(-0.48, -0.52);
  s.lineTo(0.48, -0.45);
  s.lineTo(0.45, 0.85);
  s.lineTo(-0.55, 1.55);
  s.lineTo(-1.82, 1.52); // Iconic wide GI spur
  s.lineTo(-1.72, 1.05);
  s.lineTo(-0.78, 0.72);
  s.closePath();
  const head = extrudeAlongZ(s, 0, 0.72, M1911_BLUED_STEEL, 0.035, 8);

  // Articulated steel hammer strut extending down into mainspring cap
  const strut = createChamferedBox(0.32, 3.45, 0.24, 0.02, M1911_POLISHED_STEEL);
  strut.rotateZ(M1911_GRIP_ANGLE_RAD - 0.12);
  strut.translate(-0.78, -1.85, 0);

  return sanitizeWeaponMesh(mergeParts([head, strut]));
}

// FC-02: Short Checkered Straight-Pull Trigger & Stirrup Bow (`assembledPos: [-1.55, -0.35, 0]`)
export function buildM1911TriggerGeometry(): THREE.BufferGeometry {
  // Iconic short M1911A1 serrated finger pad
  const shoe = createChamferedBox(1.18, 1.52, 0.72, 0.06, M1911_BLUED_STEEL);
  shoe.translate(1.55, -0.22, 0);

  // U-shaped sheet-steel stirrup bow straddling magazine well to push sear rearward
  const leftBar = createChamferedBox(4.35, 1.18, 0.14, 0.02, M1911_STAINLESS);
  leftBar.translate(-1.15, -0.1, -0.82);

  const rightBar = createChamferedBox(4.35, 1.18, 0.14, 0.02, M1911_STAINLESS);
  rightBar.translate(-1.15, -0.1, 0.82);

  const rearBridge = createChamferedBox(0.28, 1.18, 1.78, 0.02, M1911_STAINLESS);
  rearBridge.translate(-3.26, -0.1, 0);

  return sanitizeWeaponMesh(mergeParts([shoe, leftBar, rightBar, rearBridge]));
}

// FC-03: Single-Action Sear & Slide-Actuated Disconnector Paddle (`assembledPos: [-5.75, 0.25, 0]`)
export function buildM1911SearDisconnectorGeometry(): THREE.BufferGeometry {
  const searShape = new THREE.Shape();
  searShape.moveTo(-0.45, -0.78);
  searShape.lineTo(0.45, -0.78);
  searShape.lineTo(0.38, 0.92);
  searShape.lineTo(-0.32, 1.05);
  searShape.lineTo(-0.52, 0.45);
  searShape.closePath();
  const sear = extrudeAlongZ(searShape, 0, 0.74, M1911_POLISHED_STEEL, 0.025, 6);

  // Vertical disconnector paddle peaking up into slide recess
  const disconn = createChamferedBox(0.42, 2.38, 0.28, 0.025, M1911_STAINLESS);
  disconn.translate(0.32, 0.35, 0);

  return sanitizeWeaponMesh(mergeParts([sear, disconn]));
}

// FC-04: Tang Beavertail Automatic Grip Safety (`assembledPos: [-7.65, 0.35, 0]`)
export function buildM1911GripSafetyGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.35, -3.15);
  s.lineTo(0.68, -2.85);
  s.lineTo(0.75, 0.85);
  s.lineTo(1.55, 0.88);  // Trigger-bow blocking arm inside frame
  s.lineTo(1.55, 0.42);
  s.lineTo(0.72, 0.35);
  s.lineTo(-0.92, 0.92); // Rear tang horn shielding web of hand from hammer bite
  s.lineTo(-1.32, 0.65);
  s.lineTo(-0.68, -0.22);
  s.lineTo(-1.12, -2.55);
  s.closePath();
  const body = extrudeAlongZ(s, 0, 1.56, M1911_PARKERIZED, 0.05, 8);
  return sanitizeWeaponMesh(body);
}

// FC-05: Browning Three-Prong Flat Sear/Disconnector/Grip-Safety Leaf Spring (`assembledPos: [-7.35, -2.55, 0]`)
export function buildM1911LeafSpringGeometry(): THREE.BufferGeometry {
  const base = createChamferedBox(0.18, 1.55, 1.12, 0.02, M1911_BLUED_STEEL);
  base.translate(0, -1.45, 0);

  const leftLeaf = createChamferedBox(0.14, 3.15, 0.3, 0.015, M1911_BLUED_STEEL);
  leftLeaf.translate(0.16, 0.72, -0.36);

  const midLeaf = createChamferedBox(0.14, 3.25, 0.32, 0.015, M1911_BLUED_STEEL);
  midLeaf.translate(0.28, 0.78, 0);

  const rightLeaf = createChamferedBox(0.14, 2.75, 0.3, 0.015, M1911_BLUED_STEEL);
  rightLeaf.translate(-0.14, 0.52, 0.36);

  const combined = mergeParts([base, leftLeaf, midLeaf, rightLeaf]);
  combined.rotateZ(M1911_GRIP_ANGLE_RAD);
  return sanitizeWeaponMesh(combined);
}

// FC-06: Dynamic 23-lb Helical Hammer Mainspring (`assembledPos: [-9.25, -6.68, 0]`, `assembledRot: [0, 0, M1911_GRIP_SPRING_ROT_Z]`)
export function buildM1911MainspringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: 5.2,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.25,
      wireRadius: 0.048,
      coils: 20,
      radialSegments: 8,
      stepsPerCoil: 14,
    }),
    M1911_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}

// M-01: 7-Round Single-Stack .45 ACP Magazine Body (`assembledPos: [-4.65, -3.55, 0]`, `assembledRot: [0, 0, M1911_GRIP_ANGLE_RAD]`)
export function buildM1911MagBodyGeometry(): THREE.BufferGeometry {
  const outer = createChamferedBox(3.44, 11.0, 1.38, 0.05, M1911_BLUED_STEEL);
  const baseplate = createChamferedBox(3.86, 0.32, 1.64, 0.04, M1911_BLUED_STEEL);
  baseplate.translate(0.05, -5.66, 0);

  const solid = mergeParts([outer, baseplate]);

  // Hollow internal cartridge column + top feed lip slot
  const cavity = createChamferedBox(3.2, 10.75, 1.18, 0.02, '#242a34');
  cavity.translate(0, 0.25, 0);

  const feedSlot = createChamferedBox(3.6, 1.15, 0.94, 0.01, '#242a34');
  feedSlot.translate(0.15, 5.15, 0);

  return sanitizeWeaponMesh(csgSubtract(solid, [cavity, feedSlot]));
}

// M-02: Dimpled Steel Single-Stack Magazine Follower (`assembledPos: [-5.87, -7.31, 0]`, `assembledRot: [0, 0, M1911_GRIP_ANGLE_RAD]`)
export function buildM1911MagFollowerGeometry(): THREE.BufferGeometry {
  const deck = createChamferedBox(3.06, 0.34, 1.12, 0.03, M1911_POLISHED_STEEL);
  deck.rotateZ(0.08);
  deck.translate(0, 0.16, 0);

  // Classic Colt M1911 center last-round control dimple
  const dimple = createBeveledCylinder(0.14, 0.16, 0.14, 0.02, 14, M1911_STAINLESS);
  dimple.translate(0.35, 0.34, 0);

  // Front anti-tilt guide skirt & left-side slide-stop lifting shelf
  const skirt = createChamferedBox(0.32, 0.85, 1.08, 0.02, M1911_POLISHED_STEEL);
  skirt.translate(1.32, -0.32, 0);

  const stopShelf = createChamferedBox(0.85, 0.24, 0.34, 0.02, M1911_POLISHED_STEEL);
  stopShelf.translate(0.65, -0.1, -0.46);

  return sanitizeWeaponMesh(mergeParts([deck, dimple, skirt, stopShelf]));
}

// M-03: Dynamic 7-Round Single-Stack Magazine Spring (`assembledPos: [-6.33, -8.73, 0]`, `assembledRot: [0, 0, M1911_GRIP_SPRING_ROT_Z]`)
export function buildM1911MagSpringGeometry(): THREE.BufferGeometry {
  const spring = paintGeometry(
    createHelicalSpring({
      axis: 'x',
      start: 0.0,
      end: 1.65,
      centerY: 0,
      centerZ: 0,
      coilRadius: 0.42,
      wireRadius: 0.055,
      coils: 7,
      radialSegments: 8,
      stepsPerCoil: 16,
    }),
    M1911_SPRING_STEEL
  );
  return sanitizeWeaponMesh(spring);
}
