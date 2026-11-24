import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import { getLoadedWeaponPlugin } from '../../weapons/registry';
import {
  DEFAULT_ATTACHMENT_LOADOUT,
  type MuzzleAttachmentId,
  type OpticAttachmentId,
  getWeaponAttachmentMountProfile,
} from '../attachments/attachmentSpecs';
import { useAttachmentStore } from '../attachments/attachmentStore';
import { playbackClock } from '../clock/playbackClock';
import {
  SECTION_CUT_BOX_PLANES,
  SECTION_CUT_PLANES,
} from './StencilSectionCap';

const noRaycast = (): null => null;
const HDR_RED_DOT_COLOR = new THREE.Color(4.8, 0.45, 0.45);

// ============================================================================
// Procedural Cutaway-Ready Geometry Builders (1 unit = 1 cm · +X fwd, +Y up)
// All geometries are built once per mounted attachment and cleanly disposed.
// ============================================================================

interface SuppressorMeshes {
  outerTube: THREE.BufferGeometry;
  qdCollar: THREE.BufferGeometry;
  endCap: THREE.BufferGeometry;
  blastBaffle: THREE.BufferGeometry;
  kBaffleCone: THREE.BufferGeometry;
  baffleSpacer: THREE.BufferGeometry;
  boreCoreTube: THREE.BufferGeometry;
}

function buildSuppressorGeometries(): SuppressorMeshes {
  // Hollow titanium outer sleeve (Lathe around Y then rotated to +X):
  // spans X in [-0.48, 17.4], outer R = 1.90, inner wall R = 1.66 (2.4 mm Ti-6Al-4V wall)
  // Rear QD skirt seats flush over factory barrel shoulder / crush washer with zero double-collar seam.
  const tubePts = [
    new THREE.Vector2(0.62, -0.48), // Rear barrel-shoulder seat (flush, encapsulates crush washer/spigot)
    new THREE.Vector2(1.38, -0.48),
    new THREE.Vector2(1.52, -0.18),
    new THREE.Vector2(1.52, 0.72),
    new THREE.Vector2(1.88, 1.05),
    new THREE.Vector2(1.9, 1.45),
    new THREE.Vector2(1.9, 5.2),
    new THREE.Vector2(1.96, 5.38), // Welded circumferential reinforcement band 1
    new THREE.Vector2(1.96, 5.72),
    new THREE.Vector2(1.9, 5.9),
    new THREE.Vector2(1.9, 11.4),
    new THREE.Vector2(1.96, 11.58), // Welded circumferential reinforcement band 2
    new THREE.Vector2(1.96, 11.92),
    new THREE.Vector2(1.9, 12.1),
    new THREE.Vector2(1.9, 16.95),
    new THREE.Vector2(1.76, 17.4),
    new THREE.Vector2(1.64, 17.4),
    new THREE.Vector2(1.64, 1.1),
    new THREE.Vector2(1.18, 0.72),
    new THREE.Vector2(0.62, -0.48),
  ];
  const outerTube = new THREE.LatheGeometry(tubePts, 36);
  outerTube.rotateZ(-Math.PI / 2);
  outerTube.computeVertexNormals();

  // Rear QD ratcheting locking collar with wrench flats
  const qdCollar = new THREE.CylinderGeometry(1.66, 1.66, 1.05, 8);
  qdCollar.rotateZ(-Math.PI / 2);
  qdCollar.translate(0.22, 0, 0);

  // Recessed front flash-hiding endcap ring
  const capPts = [
    new THREE.Vector2(0.56, 16.85),
    new THREE.Vector2(1.66, 16.85),
    new THREE.Vector2(1.66, 17.42),
    new THREE.Vector2(1.22, 17.42),
    new THREE.Vector2(0.84, 17.12),
    new THREE.Vector2(0.56, 17.12),
    new THREE.Vector2(0.56, 16.85),
  ];
  const endCap = new THREE.LatheGeometry(capPts, 32);
  endCap.rotateZ(-Math.PI / 2);
  endCap.computeVertexNormals();

  // Stage-1 Inconel 718 heavy blast baffle cone (thick angled cone facing incoming gas)
  const blastPts = [
    new THREE.Vector2(0.54, 2.35),
    new THREE.Vector2(0.76, 2.35),
    new THREE.Vector2(1.62, 3.68),
    new THREE.Vector2(1.62, 4.02),
    new THREE.Vector2(1.42, 4.02),
    new THREE.Vector2(0.68, 2.75),
    new THREE.Vector2(0.54, 2.75),
    new THREE.Vector2(0.54, 2.35),
  ];
  const blastBaffle = new THREE.LatheGeometry(blastPts, 32);
  blastBaffle.rotateZ(-Math.PI / 2);
  blastBaffle.computeVertexNormals();

  // Reusable monocore K-Baffle cone element (centered locally at X=0, instanced/placed ×6)
  const kPts = [
    new THREE.Vector2(0.52, -0.58),
    new THREE.Vector2(0.7, -0.58),
    new THREE.Vector2(1.6, 0.56),
    new THREE.Vector2(1.6, 0.84),
    new THREE.Vector2(1.42, 0.84),
    new THREE.Vector2(1.42, 0.62),
    new THREE.Vector2(0.66, -0.26),
    new THREE.Vector2(0.52, -0.26),
    new THREE.Vector2(0.52, -0.58),
  ];
  const kBaffleCone = new THREE.LatheGeometry(kPts, 28);
  kBaffleCone.rotateZ(-Math.PI / 2);
  kBaffleCone.computeVertexNormals();

  // Coaxial baffle spacer ring (between K-baffles for secondary pressure-relief pockets)
  const spacerPts = [
    new THREE.Vector2(1.46, -0.82),
    new THREE.Vector2(1.62, -0.82),
    new THREE.Vector2(1.62, 0.82),
    new THREE.Vector2(1.46, 0.82),
    new THREE.Vector2(1.46, -0.82),
  ];
  const baffleSpacer = new THREE.LatheGeometry(spacerPts, 28);
  baffleSpacer.rotateZ(-Math.PI / 2);
  baffleSpacer.computeVertexNormals();

  // Inner dark bore shadow sleeve visible inside cutaway core
  const boreCoreTube = new THREE.CylinderGeometry(0.46, 0.46, 16.6, 20, 1, true);
  boreCoreTube.rotateZ(-Math.PI / 2);
  boreCoreTube.translate(8.6, 0, 0);

  return {
    outerTube,
    qdCollar,
    endCap,
    blastBaffle,
    kBaffleCone,
    baffleSpacer,
    boreCoreTube,
  };
}

interface BrakeMeshes {
  rearCollar: THREE.BufferGeometry;
  spineTop: THREE.BufferGeometry;
  spineBot: THREE.BufferGeometry;
  baffleWall: THREE.BufferGeometry;
  frontCrown: THREE.BufferGeometry;
}

function buildMuzzleBrakeGeometries(): BrakeMeshes {
  // Rear tapered timing collar spanning X in [-0.48, +1.28] to seat flush over barrel shoulder
  // and completely encapsulate factory crush washers / threaded spigots with zero double-collar seam.
  const rearCollar = new THREE.CylinderGeometry(1.18, 1.24, 1.76, 16);
  rearCollar.rotateZ(-Math.PI / 2);
  rearCollar.translate(0.4, 0, 0);

  // Upper & lower machined steel bridge plates forming twin open lateral gas chambers
  const spineTop = new THREE.BoxGeometry(5.6, 0.44, 2.24);
  spineTop.translate(3.55, 0.94, 0);

  const spineBot = new THREE.BoxGeometry(5.6, 0.44, 2.24);
  spineBot.translate(3.55, -0.94, 0);

  // Rearward-swept baffle partition wall (placed ×2 to form Dual-Chamber Competition Brake)
  const baffleWall = new THREE.BoxGeometry(0.54, 1.72, 2.38);

  // Front muzzle crown bridge with central projectile exit bore collar
  const crownPts = [
    new THREE.Vector2(0.56, 5.82),
    new THREE.Vector2(1.24, 5.82),
    new THREE.Vector2(1.24, 6.42),
    new THREE.Vector2(1.06, 6.42),
    new THREE.Vector2(0.56, 6.18),
    new THREE.Vector2(0.56, 5.82),
  ];
  const frontCrown = new THREE.LatheGeometry(crownPts, 24);
  frontCrown.rotateZ(-Math.PI / 2);
  frontCrown.computeVertexNormals();

  return { rearCollar, spineTop, spineBot, baffleWall, frontCrown };
}

interface FlashHiderMeshes {
  baseMount: THREE.BufferGeometry;
  prong: THREE.BufferGeometry;
}

function buildFlashHiderGeometries(): FlashHiderMeshes {
  // Tapered rear barrel-shoulder sleeve spans X in [-0.48, +1.72], cleanly seating over
  // factory barrel crush washers & threaded spigots with a seamless single-collar silhouette.
  const basePts = [
    new THREE.Vector2(0.54, -0.48),
    new THREE.Vector2(1.06, -0.48),
    new THREE.Vector2(1.18, -0.14),
    new THREE.Vector2(1.22, 0.28),
    new THREE.Vector2(1.18, 1.45),
    new THREE.Vector2(1.05, 1.72),
    new THREE.Vector2(0.58, 1.72),
    new THREE.Vector2(0.54, -0.48),
  ];
  const baseMount = new THREE.LatheGeometry(basePts, 24);
  baseMount.rotateZ(-Math.PI / 2);
  baseMount.computeVertexNormals();

  // Single tapered 3-prong tine (rotated around X at 0°, 120°, 240°)
  const prong = new THREE.BoxGeometry(4.25, 0.34, 0.56);
  prong.translate(3.72, 0.86, 0);

  return { baseMount, prong };
}

interface RedDotMeshes {
  railBase: THREE.BufferGeometry;
  hoodLeft: THREE.BufferGeometry;
  hoodRight: THREE.BufferGeometry;
  hoodTop: THREE.BufferGeometry;
  lens: THREE.BufferGeometry;
  reticleDot: THREE.BufferGeometry;
  emitterDiode: THREE.BufferGeometry;
  turret: THREE.BufferGeometry;
}

function buildRedDotGeometries(): RedDotMeshes {
  // Low-profile MIL-STD-1913 / MOS clamp base seated flush at Y = 0 (claw grips down to -0.06)
  const railBase = new THREE.BoxGeometry(4.65, 0.78, 2.68);
  railBase.translate(0, 0.33, 0);

  // Open-reflex beveled protective aluminum shroud arches
  const hoodLeft = new THREE.BoxGeometry(3.2, 2.28, 0.28);
  hoodLeft.translate(0.35, 1.76, -1.24);

  const hoodRight = new THREE.BoxGeometry(3.2, 2.28, 0.28);
  hoodRight.translate(0.35, 1.76, 1.24);

  const hoodTop = new THREE.BoxGeometry(3.2, 0.3, 2.76);
  hoodTop.translate(0.35, 2.86, 0);

  // Angled ruby multi-coated dichroic reflex lens
  const lens = new THREE.BoxGeometry(0.14, 1.98, 2.22);
  lens.rotateZ(-0.14);
  lens.translate(1.22, 1.74, 0);

  // Glowing 2 MOA HDR red reticle dot suspended in optical plane
  const reticleDot = new THREE.SphereGeometry(0.14, 14, 12);
  reticleDot.translate(1.06, 1.78, 0);

  // Rear micro-LED emitter diode projecting forward onto angled ruby lens (visible in CT slice!)
  const emitterDiode = new THREE.CylinderGeometry(0.18, 0.24, 0.52, 14);
  emitterDiode.rotateZ(-Math.PI / 2 + 0.22);
  emitterDiode.translate(-1.35, 0.92, 0);

  // Windage / elevation brass micro-adjuster turret
  const turret = new THREE.CylinderGeometry(0.24, 0.24, 0.22, 14);

  return {
    railBase,
    hoodLeft,
    hoodRight,
    hoodTop,
    lens,
    reticleDot,
    emitterDiode,
    turret,
  };
}

interface LpvoMeshes {
  railBase: THREE.BufferGeometry;
  cantileverArm: THREE.BufferGeometry;
  ringClamp: THREE.BufferGeometry;
  outerTube: THREE.BufferGeometry;
  erectorTube: THREE.BufferGeometry;
  turretTop: THREE.BufferGeometry;
  turretSide: THREE.BufferGeometry;
  throwLever: THREE.BufferGeometry;
  lensObj: THREE.BufferGeometry;
  lensInner: THREE.BufferGeometry;
  reticleDisk: THREE.BufferGeometry;
  lensOcular: THREE.BufferGeometry;
}

function buildLpvoGeometries(): LpvoMeshes {
  // Full-length cantilever Picatinny base seated flush at Y = 0
  const railBase = new THREE.BoxGeometry(9.6, 0.72, 2.38);
  railBase.translate(-0.6, 0.3, 0);

  // Angled forward-cantilevered CNC riser bridge
  const cantileverArm = new THREE.BoxGeometry(11.4, 1.1, 1.56);
  cantileverArm.translate(0.9, 1.25, 0);

  // 30mm Scope Ring (placed ×2 along the cantilever)
  const ringClamp = new THREE.CylinderGeometry(1.78, 1.78, 1.9, 28, 1, false);
  ringClamp.rotateZ(-Math.PI / 2);

  // Hollow stepped 1-8x24 LPVO outer aluminum scope tube (centered at Y = 3.25)
  const scopePts = [
    new THREE.Vector2(1.88, -12.6), // Ocular eyepiece rim
    new THREE.Vector2(2.14, -12.6),
    new THREE.Vector2(2.14, -7.8),
    new THREE.Vector2(2.26, -7.5), // Magnification power ring
    new THREE.Vector2(2.26, -6.2),
    new THREE.Vector2(1.56, -5.6), // 30mm main tube body
    new THREE.Vector2(1.56, 6.2),
    new THREE.Vector2(1.86, 7.6), // 24mm objective flare
    new THREE.Vector2(1.86, 12.8),
    new THREE.Vector2(1.62, 12.8), // Inner cavity wall (reveals lens stack in CT slice!)
    new THREE.Vector2(1.62, 7.5),
    new THREE.Vector2(1.34, 6.1),
    new THREE.Vector2(1.34, -5.6),
    new THREE.Vector2(1.88, -6.3),
    new THREE.Vector2(1.88, -12.6),
  ];
  const outerTube = new THREE.LatheGeometry(scopePts, 36);
  outerTube.rotateZ(-Math.PI / 2);
  outerTube.translate(1.2, 3.25, 0);
  outerTube.computeVertexNormals();

  // Internal precision brass/steel optical erector tube (visible in CT slice C!)
  const erectorTube = new THREE.CylinderGeometry(0.94, 0.94, 12.6, 24, 1, true);
  erectorTube.rotateZ(-Math.PI / 2);
  erectorTube.translate(0.5, 3.25, 0);

  // Elevation & Windage MIL turret drums
  const turretTop = new THREE.CylinderGeometry(0.86, 0.92, 1.38, 22);
  turretTop.translate(0.6, 5.25, 0);

  const turretSide = new THREE.CylinderGeometry(0.82, 0.88, 1.25, 22);
  turretSide.rotateX(Math.PI / 2);
  turretSide.translate(0.6, 3.25, 1.98);

  // Quick magnification throw lever lug
  const throwLever = new THREE.BoxGeometry(0.55, 1.45, 0.42);
  throwLever.translate(-5.6, 5.45, 0.4);

  // Multi-coated emerald optical lenses (front objective, internal erector elements, FFP reticle, ocular)
  const lensObj = new THREE.CylinderGeometry(1.58, 1.58, 0.42, 28);
  lensObj.rotateZ(-Math.PI / 2);

  const lensInner = new THREE.CylinderGeometry(0.86, 0.86, 0.28, 24);
  lensInner.rotateZ(-Math.PI / 2);

  const reticleDisk = new THREE.CylinderGeometry(0.84, 0.84, 0.08, 24);
  reticleDisk.rotateZ(-Math.PI / 2);
  reticleDisk.translate(3.2, 3.25, 0);

  const lensOcular = new THREE.CylinderGeometry(1.82, 1.82, 0.36, 28);
  lensOcular.rotateZ(-Math.PI / 2);
  lensOcular.translate(-10.8, 3.25, 0);

  return {
    railBase,
    cantileverArm,
    ringClamp,
    outerTube,
    erectorTube,
    turretTop,
    turretSide,
    throwLever,
    lensObj,
    lensInner,
    reticleDisk,
    lensOcular,
  };
}

export interface ThermalMeshes {
  railBase: THREE.BufferGeometry;
  qdLever: THREE.BufferGeometry;
  chassisOuter: THREE.BufferGeometry;
  chassisTopDeck: THREE.BufferGeometry;
  coolingFin: THREE.BufferGeometry;
  turretCap: THREE.BufferGeometry;
  focusRing: THREE.BufferGeometry;
  lensHood: THREE.BufferGeometry;
  germaniumLens: THREE.BufferGeometry;
  batteryPod: THREE.BufferGeometry;
  batteryCap: THREE.BufferGeometry;
  keypadButton: THREE.BufferGeometry;
  eyecup: THREE.BufferGeometry;
  voxSensor: THREE.BufferGeometry;
  dspPcb: THREE.BufferGeometry;
  oledPrism: THREE.BufferGeometry;
}

/**
 * Builds a sculpted dark-anodized magnesium FLIR thermal weapon sight with:
 * - Chamfered octagonal CNC magnesium main housing + raised upper control deck
 * - Milled flank cooling heat-sink fins (mounted bilaterally)
 * - Knurled windage, elevation & objective manual-focus turret caps
 * - Flared anti-glare objective sunshade hood + Germanium amber-violet coated lens
 * - 4-bellows pleated vulcanized-rubber accordion eyecup
 * - Full CT `[C]` cutaway internals (gold VOx microbolometer die, DSP PCB, OLED prism)
 * Caller owns `.dispose()` on every returned BufferGeometry.
 */
export function buildThermalGeometries(): ThermalMeshes {
  // Twin-lever QD Picatinny rail clamp base seated flush at Y = 0
  const railBase = new THREE.BoxGeometry(8.8, 0.78, 2.56);
  railBase.translate(0, 0.33, 0);

  // Side QD throw-lever latch bar (placed ×2 along left flank of rail clamp)
  const qdLever = new THREE.BoxGeometry(1.75, 0.36, 0.42);

  // Sculpted chamfered octagonal magnesium chassis extruded along +X (replaces plain grey box)
  const hw = 2.22; // half Z width
  const hh = 2.02; // half Y height
  const ch = 0.56; // 45° CNC corner chamfer
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-hw + ch, -hh);
  bodyShape.lineTo(hw - ch, -hh);
  bodyShape.lineTo(hw, -hh + ch);
  bodyShape.lineTo(hw, hh - ch);
  bodyShape.lineTo(hw - ch, hh);
  bodyShape.lineTo(-hw + ch, hh);
  bodyShape.lineTo(-hw, hh - ch);
  bodyShape.lineTo(-hw, -hh + ch);
  bodyShape.closePath();

  const chassisOuter = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 9.8,
    bevelEnabled: true,
    bevelThickness: 0.24,
    bevelSize: 0.18,
    bevelSegments: 2,
  });
  // Extrusion runs along +Z; rotate +90° around Y so length spans +X, centered around X = +0.15, Y = 2.82
  chassisOuter.rotateY(Math.PI / 2);
  chassisOuter.translate(-4.75, 2.82, 0);
  chassisOuter.computeVertexNormals();

  // Raised machined upper control bezel deck framing the 4-button tactile keypad
  const chassisTopDeck = new THREE.BoxGeometry(6.8, 0.36, 2.9);
  chassisTopDeck.translate(-0.2, 4.96, 0);

  // Single chamfered magnesium cooling heat-sink fin (placed bilaterally ×7 along housing flanks)
  const coolingFin = new THREE.BoxGeometry(0.28, 2.15, 0.48);

  // Knurled/fluted turret cap (12-sided grip flutes; used for top elevation/menu & side windage turrets)
  const turretCap = new THREE.CylinderGeometry(0.58, 0.64, 0.72, 12);

  // Knurled objective manual-focus collar ring seated between main housing & flared sunshade hood
  const focusRingPts = [
    new THREE.Vector2(1.54, 4.95),
    new THREE.Vector2(2.04, 4.95),
    new THREE.Vector2(2.14, 5.18),
    new THREE.Vector2(2.14, 5.92),
    new THREE.Vector2(2.02, 6.08),
    new THREE.Vector2(1.56, 6.08),
    new THREE.Vector2(1.54, 4.95),
  ];
  const focusRing = new THREE.LatheGeometry(focusRingPts, 18);
  focusRing.rotateZ(-Math.PI / 2);
  focusRing.translate(0, 2.85, 0);
  focusRing.computeVertexNormals();

  // Flared stepped objective sunshade hood with internal anti-glare baffle ridge
  const hoodPts = [
    new THREE.Vector2(1.52, 6.02),
    new THREE.Vector2(1.94, 6.02),
    new THREE.Vector2(2.16, 6.85),
    new THREE.Vector2(2.28, 8.25), // Flared sunshade crown
    new THREE.Vector2(2.12, 8.42),
    new THREE.Vector2(1.92, 8.42),
    new THREE.Vector2(1.88, 7.65),
    new THREE.Vector2(1.76, 7.45), // Internal anti-glare baffle step
    new THREE.Vector2(1.66, 6.22),
    new THREE.Vector2(1.52, 6.02),
  ];
  const lensHood = new THREE.LatheGeometry(hoodPts, 36);
  lensHood.rotateZ(-Math.PI / 2);
  lensHood.translate(0, 2.85, 0);
  lensHood.computeVertexNormals();

  // Single-crystal Germanium LWIR metallic amber-violet objective lens recessed inside hood
  const germaniumLens = new THREE.CylinderGeometry(1.62, 1.62, 0.42, 32);
  germaniumLens.rotateZ(-Math.PI / 2);
  germaniumLens.translate(6.65, 2.85, 0);

  // Left-flank CR123 battery pod cylinder + knurled endcap
  const batteryPod = new THREE.CylinderGeometry(0.76, 0.76, 5.2, 20);
  batteryPod.rotateZ(-Math.PI / 2);
  batteryPod.translate(-0.7, 2.18, -2.58);

  const batteryCap = new THREE.CylinderGeometry(0.84, 0.84, 0.56, 12);
  batteryCap.rotateZ(-Math.PI / 2);
  batteryCap.translate(2.08, 2.18, -2.58);

  // Top tactile control button
  const keypadButton = new THREE.CylinderGeometry(0.3, 0.34, 0.24, 14);

  // Rear 4-bellows pleated rubber accordion eyecup + flared contoured ocular lip
  const eyePts = [
    new THREE.Vector2(1.06, -4.85),
    new THREE.Vector2(1.38, -4.85),
    new THREE.Vector2(1.48, -5.2), // Bellows crest 1
    new THREE.Vector2(1.22, -5.5), // Bellows valley 1
    new THREE.Vector2(1.5, -5.82), // Bellows crest 2
    new THREE.Vector2(1.24, -6.12), // Bellows valley 2
    new THREE.Vector2(1.54, -6.45), // Bellows crest 3
    new THREE.Vector2(1.28, -6.75), // Bellows valley 3
    new THREE.Vector2(1.66, -7.25), // Flared rubber eye-cup rim
    new THREE.Vector2(1.58, -7.45),
    new THREE.Vector2(1.36, -7.45),
    new THREE.Vector2(1.1, -6.65),
    new THREE.Vector2(1.02, -4.85),
    new THREE.Vector2(1.06, -4.85),
  ];
  const eyecup = new THREE.LatheGeometry(eyePts, 32);
  eyecup.rotateZ(-Math.PI / 2);
  eyecup.translate(0, 2.85, 0);
  eyecup.computeVertexNormals();

  // Internal VOx microbolometer gold focal-plane array die (visible in CT slice!)
  const voxSensor = new THREE.BoxGeometry(0.34, 1.68, 1.68);
  voxSensor.translate(2.4, 2.85, 0);

  // Internal green/emerald DSP electronics board
  const dspPcb = new THREE.BoxGeometry(4.4, 0.24, 2.85);
  dspPcb.translate(-0.6, 1.45, 0);

  // Internal rear micro-OLED prism display
  const oledPrism = new THREE.BoxGeometry(1.85, 1.55, 1.55);
  oledPrism.translate(-3.4, 2.85, 0);

  return {
    railBase,
    qdLever,
    chassisOuter,
    chassisTopDeck,
    coolingFin,
    turretCap,
    focusRing,
    lensHood,
    germaniumLens,
    batteryPod,
    batteryCap,
    keypadButton,
    eyecup,
    voxSensor,
    dspPcb,
    oledPrism,
  };
}

// ============================================================================
// Sub-Components for Muzzle & Optic Assemblies
// ============================================================================

const K_BAFFLE_XS = [5.4, 7.25, 9.1, 10.95, 12.8, 14.65] as const;
const LPVO_INNER_LENS_XS = [-4.2, -1.0, 2.1, 6.8] as const;
const THERMAL_BTN_XS = [-2.4, -0.8, 0.8, 2.4] as const;
const THERMAL_FIN_XS = [-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0] as const;
const THERMAL_QD_LEVER_XS = [-2.2, 2.2] as const;
const PRONG_ANGLES = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3] as const;

interface MuzzleMeshGroupProps {
  muzzleId: Exclude<MuzzleAttachmentId, 'none'>;
  clipPlanes: THREE.Plane[] | null;
  sectionCut: boolean;
}

const MuzzleMeshGroup: React.FC<MuzzleMeshGroupProps> = React.memo(
  ({ muzzleId, clipPlanes, sectionCut }) => {
    const suppGeos = useMemo(
      () => (muzzleId === 'suppressor' ? buildSuppressorGeometries() : null),
      [muzzleId]
    );
    const brakeGeos = useMemo(
      () => (muzzleId === 'muzzle_brake' ? buildMuzzleBrakeGeometries() : null),
      [muzzleId]
    );
    const fhGeos = useMemo(
      () => (muzzleId === 'flash_hider' ? buildFlashHiderGeometries() : null),
      [muzzleId]
    );

    useEffect(() => {
      return () => {
        if (suppGeos) Object.values(suppGeos).forEach((g) => g.dispose());
        if (brakeGeos) Object.values(brakeGeos).forEach((g) => g.dispose());
        if (fhGeos) Object.values(fhGeos).forEach((g) => g.dispose());
      };
    }, [suppGeos, brakeGeos, fhGeos]);

    const shellSide = sectionCut ? THREE.DoubleSide : THREE.FrontSide;
    const matKey = sectionCut ? `cut-${clipPlanes?.length ?? 0}` : 'solid';

    if (muzzleId === 'suppressor' && suppGeos) {
      return (
        <group name="AttachmentMuzzleSuppressor">
          {/* Outer Titanium-6Al-4V Sleeve (slices cleanly in CT mode!) */}
          <mesh
            geometry={suppGeos.outerTube}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`supp-tube-${matKey}`}
              color="#55606e"
              metalness={0.86}
              roughness={0.31}
              clearcoat={0.18}
              clearcoatRoughness={0.24}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Rear QD Ratcheting Locking Collar */}
          <mesh
            geometry={suppGeos.qdCollar}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`supp-qd-${matKey}`}
              color="#3a424e"
              metalness={0.88}
              roughness={0.28}
              envMapIntensity={1.4}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Front Flash-Reducing Endcap */}
          <mesh
            geometry={suppGeos.endCap}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`supp-cap-${matKey}`}
              color="#434d5b"
              metalness={0.88}
              roughness={0.26}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Internal Blast Baffle (Warm Inconel 718 — gleams inside CT Slice!) */}
          <mesh
            geometry={suppGeos.blastBaffle}
            raycast={noRaycast}
            renderOrder={3}
          >
            <meshPhysicalMaterial
              key={`supp-blast-${matKey}`}
              color="#c29b62"
              metalness={0.92}
              roughness={0.24}
              envMapIntensity={1.55}
              clippingPlanes={clipPlanes}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* 6-Stage CNC Monocore K-Baffle Cones + Coaxial Spacers (Cutaway Showcase!) */}
          {K_BAFFLE_XS.map((bx, idx) => (
            <group key={`kbaffle-${idx}`} position={[bx, 0, 0]}>
              <mesh
                geometry={suppGeos.kBaffleCone}
                raycast={noRaycast}
                renderOrder={3}
              >
                <meshPhysicalMaterial
                  key={`supp-kb-${matKey}`}
                  color={idx % 2 === 0 ? '#9aa6b5' : '#b2becd'}
                  metalness={0.94}
                  roughness={0.21}
                  envMapIntensity={1.6}
                  clippingPlanes={clipPlanes}
                  side={THREE.DoubleSide}
                />
              </mesh>
              <mesh
                geometry={suppGeos.baffleSpacer}
                raycast={noRaycast}
                renderOrder={2}
              >
                <meshPhysicalMaterial
                  key={`supp-sp-${matKey}`}
                  color="#687382"
                  metalness={0.84}
                  roughness={0.34}
                  clippingPlanes={clipPlanes}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          ))}

          {/* Dark Internal Carbon-Fouled Bore Axis Liner */}
          {sectionCut && (
            <mesh
              geometry={suppGeos.boreCoreTube}
              raycast={noRaycast}
              renderOrder={2}
            >
              <meshStandardMaterial
                color="#1f2937"
                metalness={0.4}
                roughness={0.8}
                clippingPlanes={clipPlanes}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}
        </group>
      );
    }

    if (muzzleId === 'muzzle_brake' && brakeGeos) {
      return (
        <group name="AttachmentMuzzleBrake">
          <mesh
            geometry={brakeGeos.rearCollar}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`brk-c-${matKey}`}
              color="#3d4552"
              metalness={0.88}
              roughness={0.28}
              envMapIntensity={1.5}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={brakeGeos.spineTop}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`brk-t-${matKey}`}
              color="#475161"
              metalness={0.86}
              roughness={0.3}
              envMapIntensity={1.5}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={brakeGeos.spineBot}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`brk-b-${matKey}`}
              color="#475161"
              metalness={0.86}
              roughness={0.3}
              envMapIntensity={1.5}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          {/* Twin Rearward-Swept Competition Baffle Walls */}
          <mesh
            geometry={brakeGeos.baffleWall}
            position={[2.45, 0, 0]}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`brk-w1-${matKey}`}
              color="#7a8596"
              metalness={0.92}
              roughness={0.22}
              envMapIntensity={1.58}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={brakeGeos.baffleWall}
            position={[4.45, 0, 0]}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`brk-w2-${matKey}`}
              color="#7a8596"
              metalness={0.92}
              roughness={0.22}
              envMapIntensity={1.58}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={brakeGeos.frontCrown}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`brk-cr-${matKey}`}
              color="#414b59"
              metalness={0.88}
              roughness={0.27}
              envMapIntensity={1.5}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
        </group>
      );
    }

    if (muzzleId === 'flash_hider' && fhGeos) {
      return (
        <group name="AttachmentMuzzleFlashHider">
          <mesh
            geometry={fhGeos.baseMount}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`fh-base-${matKey}`}
              color="#3d4552"
              metalness={0.88}
              roughness={0.28}
              envMapIntensity={1.5}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          {PRONG_ANGLES.map((ang, idx) => (
            <mesh
              key={`prong-${idx}`}
              geometry={fhGeos.prong}
              rotation={[ang, 0, 0]}
              castShadow
              receiveShadow
              raycast={noRaycast}
            >
              <meshPhysicalMaterial
                key={`fh-pr-${matKey}`}
                color="#4d5766"
                metalness={0.9}
                roughness={0.25}
                envMapIntensity={1.55}
                clippingPlanes={clipPlanes}
                clipShadows={sectionCut}
                side={shellSide}
              />
            </mesh>
          ))}
        </group>
      );
    }

    return null;
  }
);
MuzzleMeshGroup.displayName = 'MuzzleMeshGroup';

interface OpticMeshGroupProps {
  opticId: Exclude<OpticAttachmentId, 'none'>;
  clipPlanes: THREE.Plane[] | null;
  sectionCut: boolean;
}

const OpticMeshGroup: React.FC<OpticMeshGroupProps> = React.memo(
  ({ opticId, clipPlanes, sectionCut }) => {
    const rdGeos = useMemo(
      () => (opticId === 'red_dot' ? buildRedDotGeometries() : null),
      [opticId]
    );
    const lpvoGeos = useMemo(
      () => (opticId === 'lpvo' ? buildLpvoGeometries() : null),
      [opticId]
    );
    const thermalGeos = useMemo(
      () => (opticId === 'thermal' ? buildThermalGeometries() : null),
      [opticId]
    );

    useEffect(() => {
      return () => {
        if (rdGeos) Object.values(rdGeos).forEach((g) => g.dispose());
        if (lpvoGeos) Object.values(lpvoGeos).forEach((g) => g.dispose());
        if (thermalGeos) Object.values(thermalGeos).forEach((g) => g.dispose());
      };
    }, [rdGeos, lpvoGeos, thermalGeos]);

    const shellSide = sectionCut ? THREE.DoubleSide : THREE.FrontSide;
    const matKey = sectionCut ? `cut-${clipPlanes?.length ?? 0}` : 'solid';

    if (opticId === 'red_dot' && rdGeos) {
      return (
        <group name="AttachmentOpticRedDot">
          <mesh
            geometry={rdGeos.railBase}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`rd-base-${matKey}`}
              color="#373f4b"
              metalness={0.82}
              roughness={0.34}
              envMapIntensity={1.4}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={rdGeos.hoodLeft}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`rd-hl-${matKey}`}
              color="#434c5a"
              metalness={0.84}
              roughness={0.32}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={rdGeos.hoodRight}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`rd-hr-${matKey}`}
              color="#434c5a"
              metalness={0.84}
              roughness={0.32}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={rdGeos.hoodTop}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`rd-ht-${matKey}`}
              color="#434c5a"
              metalness={0.84}
              roughness={0.32}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Micro Windage / Elevation Brass Adjusters */}
          <mesh
            geometry={rdGeos.turret}
            position={[-0.65, 0.78, 0.72]}
            raycast={noRaycast}
          >
            <meshStandardMaterial
              color="#c89d4e"
              metalness={0.92}
              roughness={0.24}
              clippingPlanes={clipPlanes}
            />
          </mesh>
          <mesh
            geometry={rdGeos.turret}
            position={[-0.65, 0.48, 1.38]}
            rotation={[Math.PI / 2, 0, 0]}
            raycast={noRaycast}
          >
            <meshStandardMaterial
              color="#c89d4e"
              metalness={0.92}
              roughness={0.24}
              clippingPlanes={clipPlanes}
            />
          </mesh>

          {/* Internal LED Projector Diode */}
          <mesh
            geometry={rdGeos.emitterDiode}
            raycast={noRaycast}
            renderOrder={4}
          >
            <meshStandardMaterial
              color="#ef4444"
              emissive="#ef4444"
              emissiveIntensity={1.8}
              metalness={0.6}
              roughness={0.2}
            />
          </mesh>

          {/* Ruby AR Multi-Coated Dichroic Reflex Lens */}
          <mesh geometry={rdGeos.lens} raycast={noRaycast} renderOrder={5}>
            <meshPhysicalMaterial
              color="#be123c"
              metalness={0.18}
              roughness={0.08}
              transmission={0.68}
              transparent
              opacity={0.58}
              ior={1.52}
              iridescence={0.85}
              iridescenceIOR={1.38}
              envMapIntensity={1.8}
              depthWrite={false}
            />
          </mesh>

          {/* Glowing HDR 2 MOA Red Reticle Dot */}
          <mesh
            geometry={rdGeos.reticleDot}
            raycast={noRaycast}
            renderOrder={6}
          >
            <meshBasicMaterial
              color={HDR_RED_DOT_COLOR}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
        </group>
      );
    }

    if (opticId === 'lpvo' && lpvoGeos) {
      return (
        <group name="AttachmentOpticLPVO">
          {/* Cantilever Rail Base + Riser Arm + Twin 30mm Rings */}
          <mesh
            geometry={lpvoGeos.railBase}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`lpvo-base-${matKey}`}
              color="#39424f"
              metalness={0.84}
              roughness={0.33}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={lpvoGeos.cantileverArm}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`lpvo-arm-${matKey}`}
              color="#434d5c"
              metalness={0.84}
              roughness={0.31}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          {[-2.9, 4.1].map((rx, idx) => (
            <mesh
              key={`lpvo-ring-${idx}`}
              geometry={lpvoGeos.ringClamp}
              position={[rx, 3.25, 0]}
              castShadow
              receiveShadow
              raycast={noRaycast}
            >
              <meshPhysicalMaterial
                key={`lpvo-rg-${matKey}`}
                color="#37404d"
                metalness={0.86}
                roughness={0.29}
                envMapIntensity={1.5}
                clippingPlanes={clipPlanes}
                clipShadows={sectionCut}
                side={shellSide}
              />
            </mesh>
          ))}

          {/* 30mm Stepped Main Scope Tube (Slices cleanly in CT mode!) */}
          <mesh
            geometry={lpvoGeos.outerTube}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`lpvo-tube-${matKey}`}
              color="#485362"
              metalness={0.86}
              roughness={0.29}
              clearcoat={0.22}
              clearcoatRoughness={0.2}
              envMapIntensity={1.55}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Capped MIL Elevation / Windage Turrets & Magnification Throw Lever */}
          <mesh
            geometry={lpvoGeos.turretTop}
            castShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`lpvo-tt-${matKey}`}
              color="#3a4350"
              metalness={0.86}
              roughness={0.27}
              clippingPlanes={clipPlanes}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={lpvoGeos.turretSide}
            castShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`lpvo-ts-${matKey}`}
              color="#3a4350"
              metalness={0.86}
              roughness={0.27}
              clippingPlanes={clipPlanes}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={lpvoGeos.throwLever}
            castShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              color="#55606e"
              metalness={0.88}
              roughness={0.26}
              clippingPlanes={clipPlanes}
            />
          </mesh>

          {/* Internal Brass/Steel Optical Erector Tube (Visible inside CT Slice C!) */}
          <mesh
            geometry={lpvoGeos.erectorTube}
            raycast={noRaycast}
            renderOrder={3}
          >
            <meshPhysicalMaterial
              key={`lpvo-erec-${matKey}`}
              color="#b5945b"
              metalness={0.92}
              roughness={0.24}
              clippingPlanes={clipPlanes}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Emerald Multi-Coated Objective & Ocular ED Glass Lenses */}
          <mesh
            geometry={lpvoGeos.lensObj}
            position={[13.3, 3.25, 0]}
            raycast={noRaycast}
            renderOrder={5}
          >
            <meshPhysicalMaterial
              color="#10b981"
              metalness={0.14}
              roughness={0.06}
              transparent
              opacity={0.72}
              ior={1.54}
              iridescence={0.9}
              iridescenceIOR={1.36}
              envMapIntensity={1.9}
            />
          </mesh>
          <mesh
            geometry={lpvoGeos.lensOcular}
            raycast={noRaycast}
            renderOrder={5}
          >
            <meshPhysicalMaterial
              color="#059669"
              metalness={0.14}
              roughness={0.07}
              transparent
              opacity={0.7}
              ior={1.54}
              iridescence={0.85}
              iridescenceIOR={1.36}
              envMapIntensity={1.85}
            />
          </mesh>

          {/* Internal 4-Element Optical Lens Stack + Illuminated FFP Reticle (CT Showcase!) */}
          {sectionCut &&
            LPVO_INNER_LENS_XS.map((lx, idx) => (
              <mesh
                key={`lpvo-ilens-${idx}`}
                geometry={lpvoGeos.lensInner}
                position={[lx, 3.25, 0]}
                raycast={noRaycast}
                renderOrder={5}
              >
                <meshPhysicalMaterial
                  color={idx % 2 === 0 ? '#34d399' : '#38bdf8'}
                  metalness={0.1}
                  roughness={0.05}
                  transparent
                  opacity={0.62}
                  iridescence={0.9}
                  depthWrite={false}
                />
              </mesh>
            ))}
          {sectionCut && (
            <mesh
              geometry={lpvoGeos.reticleDisk}
              raycast={noRaycast}
              renderOrder={6}
            >
              <meshBasicMaterial
                color="#f43f5e"
                transparent
                opacity={0.78}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>
      );
    }

    if (opticId === 'thermal' && thermalGeos) {
      return (
        <group name="AttachmentOpticThermal">
          {/* QD Picatinny Rail Mount Base + Twin Throw Levers */}
          <mesh
            geometry={thermalGeos.railBase}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`th-base-${matKey}`}
              color="#222831"
              metalness={0.86}
              roughness={0.31}
              envMapIntensity={1.4}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          {THERMAL_QD_LEVER_XS.map((qx, idx) => (
            <mesh
              key={`th-qd-${idx}`}
              geometry={thermalGeos.qdLever}
              position={[qx, 0.42, -1.46]}
              castShadow
              raycast={noRaycast}
            >
              <meshPhysicalMaterial
                color="#333c48"
                metalness={0.88}
                roughness={0.28}
                clippingPlanes={clipPlanes}
              />
            </mesh>
          ))}

          {/* Sculpted Dark Anodized Magnesium-Alloy FLIR Main Chassis */}
          <mesh
            geometry={thermalGeos.chassisOuter}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`th-ch-${matKey}`}
              color="#20262f"
              metalness={0.72}
              roughness={0.38}
              clearcoat={0.14}
              clearcoatRoughness={0.32}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Raised CNC Upper Control Bezel Deck */}
          <mesh
            geometry={thermalGeos.chassisTopDeck}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`th-deck-${matKey}`}
              color="#28303c"
              metalness={0.78}
              roughness={0.34}
              envMapIntensity={1.4}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Bilateral Chamfered Cooling Heat-Sink Fins along Housing Flanks */}
          {THERMAL_FIN_XS.map((fx, idx) => (
            <React.Fragment key={`th-fin-${idx}`}>
              <mesh
                geometry={thermalGeos.coolingFin}
                position={[fx, 2.86, 2.28]}
                castShadow
                receiveShadow
                raycast={noRaycast}
              >
                <meshPhysicalMaterial
                  color="#2d3643"
                  metalness={0.82}
                  roughness={0.32}
                  envMapIntensity={1.5}
                  clippingPlanes={clipPlanes}
                />
              </mesh>
              <mesh
                geometry={thermalGeos.coolingFin}
                position={[fx, 3.16, -2.28]}
                castShadow
                receiveShadow
                raycast={noRaycast}
              >
                <meshPhysicalMaterial
                  color="#2d3643"
                  metalness={0.82}
                  roughness={0.32}
                  envMapIntensity={1.5}
                  clippingPlanes={clipPlanes}
                />
              </mesh>
            </React.Fragment>
          ))}

          {/* Knurled Top Elevation/Menu Turret Cap & Right-Flank Windage Turret Cap */}
          <mesh
            geometry={thermalGeos.turretCap}
            position={[3.65, 5.24, 0]}
            castShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              color="#343e4c"
              metalness={0.86}
              roughness={0.27}
              envMapIntensity={1.5}
              clippingPlanes={clipPlanes}
            />
          </mesh>
          <mesh
            geometry={thermalGeos.turretCap}
            position={[3.45, 2.85, 2.48]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              color="#343e4c"
              metalness={0.86}
              roughness={0.27}
              envMapIntensity={1.5}
              clippingPlanes={clipPlanes}
            />
          </mesh>

          {/* Knurled Objective Manual-Focus Collar Ring */}
          <mesh
            geometry={thermalGeos.focusRing}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`th-focus-${matKey}`}
              color="#2f3845"
              metalness={0.84}
              roughness={0.29}
              envMapIntensity={1.48}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Flared Stepped Anti-Glare Objective Sunshade Hood */}
          <mesh
            geometry={thermalGeos.lensHood}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`th-hood-${matKey}`}
              color="#1c222b"
              metalness={0.76}
              roughness={0.35}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Iconic Single-Crystal Germanium LWIR Amber-Violet Coated Objective Lens */}
          <mesh
            geometry={thermalGeos.germaniumLens}
            raycast={noRaycast}
            renderOrder={5}
          >
            <meshPhysicalMaterial
              color="#9a6448"
              metalness={0.82}
              roughness={0.08}
              clearcoat={1.0}
              clearcoatRoughness={0.06}
              iridescence={1.0}
              iridescenceIOR={1.95}
              envMapIntensity={2.15}
            />
          </mesh>

          {/* Left-Flank CR123 Battery Cylinder + Knurled Cap */}
          <mesh
            geometry={thermalGeos.batteryPod}
            castShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              color="#252c36"
              metalness={0.8}
              roughness={0.34}
              clippingPlanes={clipPlanes}
            />
          </mesh>
          <mesh
            geometry={thermalGeos.batteryCap}
            castShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              color="#394352"
              metalness={0.88}
              roughness={0.26}
              clippingPlanes={clipPlanes}
            />
          </mesh>

          {/* Top 4-Button Tactile Control Keypad */}
          {THERMAL_BTN_XS.map((bx, idx) => (
            <mesh
              key={`th-btn-${idx}`}
              geometry={thermalGeos.keypadButton}
              position={[bx, 5.2, 0]}
              raycast={noRaycast}
            >
              <meshStandardMaterial
                color={idx === 0 ? '#f59e0b' : '#475569'}
                metalness={0.22}
                roughness={0.62}
                clippingPlanes={clipPlanes}
              />
            </mesh>
          ))}

          {/* Rear 4-Bellows Pleated Rubber Accordion Eyecup */}
          <mesh
            geometry={thermalGeos.eyecup}
            castShadow
            raycast={noRaycast}
          >
            <meshStandardMaterial
              color="#1b2028"
              metalness={0.04}
              roughness={0.86}
              clippingPlanes={clipPlanes}
              side={shellSide}
            />
          </mesh>

          {/* Internal VOx Microbolometer Die + DSP PCB + OLED Prism (Visible in CT Slice C!) */}
          {sectionCut && (
            <group name="ThermalCutawayInternals">
              <mesh
                geometry={thermalGeos.voxSensor}
                raycast={noRaycast}
                renderOrder={4}
              >
                <meshPhysicalMaterial
                  color="#eab308"
                  metalness={0.94}
                  roughness={0.16}
                  emissive="#ca8a04"
                  emissiveIntensity={0.22}
                />
              </mesh>
              <mesh
                geometry={thermalGeos.dspPcb}
                raycast={noRaycast}
                renderOrder={4}
              >
                <meshStandardMaterial
                  color="#15803d"
                  metalness={0.35}
                  roughness={0.42}
                />
              </mesh>
              <mesh
                geometry={thermalGeos.oledPrism}
                raycast={noRaycast}
                renderOrder={4}
              >
                <meshPhysicalMaterial
                  color="#38bdf8"
                  emissive="#0ea5e9"
                  emissiveIntensity={0.55}
                  metalness={0.2}
                  roughness={0.14}
                />
              </mesh>
            </group>
          )}
        </group>
      );
    }

    return null;
  }
);
OpticMeshGroup.displayName = 'OpticMeshGroup';

// ============================================================================
// Main AttachmentActor — Mounted Inside <WeaponRecoilGroup> in ArmoryViewport
// ============================================================================

export const AttachmentActor: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const screen = useAppStore((s) => s.screen);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const sectionCutAxis = useAppStore((s) => s.sectionCutAxis);

  const loadout = useAttachmentStore(
    (s) => s.loadouts[activeWeaponId] ?? DEFAULT_ATTACHMENT_LOADOUT
  );

  const muzzleGroupRef = useRef<THREE.Group>(null);
  const opticGroupRef = useRef<THREE.Group>(null);

  const profile = getWeaponAttachmentMountProfile(activeWeaponId);
  const clipPlanes = sectionCut
    ? sectionCutAxis === 'box'
      ? SECTION_CUT_BOX_PLANES
      : SECTION_CUT_PLANES
    : null;

  const hasMuzzle =
    loadout.muzzle !== 'none' &&
    profile.muzzleAnchor !== null &&
    profile.allowedMuzzles.includes(loadout.muzzle);

  const hasOptic =
    loadout.optic !== 'none' &&
    profile.opticRailAnchor !== null &&
    profile.allowedOptics.includes(loadout.optic);

  // Zero-GC 60fps kinematic & disassembly tracking:
  //  - In `firing` mode, follows reciprocating barrels (M82A1, G17, P320, P08, AN-94, G11)
  //    and reciprocating pistol slides (G17, P320) 1:1.
  //  - In `explode` mode, translates attachments along their natural gunsmith removal axes.
  useFrame(() => {
    const appState = useAppStore.getState();
    const clock = playbackClock.getState();
    const isFiring = appState.mode === 'firing';
    const isExplode = appState.mode === 'explode' && !appState.fieldStripActive;
    const tExplode = isExplode ? clock.animatedProgress : 0;
    const f = isFiring ? clock.animatedFireProgress : 0;
    const plugin = isFiring
      ? getLoadedWeaponPlugin(appState.activeWeaponId)
      : null;

    if (muzzleGroupRef.current && profile.muzzleAnchor) {
      let mx = profile.muzzleAnchor[0];
      let my = profile.muzzleAnchor[1];
      let mz = profile.muzzleAnchor[2];
      let rx = 0;
      let ry = 0;
      let rz = 0;

      if (isFiring && plugin && profile.muzzleFollowPartId) {
        const kd = plugin.computeFiringKinematics(
          profile.muzzleFollowPartId,
          f
        );
        if (kd.pos) {
          mx += kd.pos[0];
          my += kd.pos[1];
          mz += kd.pos[2];
        }
        if (kd.rot) {
          rx += kd.rot[0];
          ry += kd.rot[1];
          rz += kd.rot[2];
        }
      } else if (tExplode > 1e-4) {
        mx += 5.4 * profile.modelScale * tExplode;
      }

      muzzleGroupRef.current.position.set(mx, my, mz);
      muzzleGroupRef.current.rotation.set(rx, ry, rz);
      muzzleGroupRef.current.scale.setScalar(profile.modelScale);
    }

    if (opticGroupRef.current && profile.opticRailAnchor) {
      let ox = profile.opticRailAnchor[0];
      let oy = profile.opticRailAnchor[1];
      let oz = profile.opticRailAnchor[2];
      let rx = 0;
      let ry = 0;
      let rz = 0;

      if (isFiring && plugin && profile.opticFollowPartId) {
        const kd = plugin.computeFiringKinematics(profile.opticFollowPartId, f);
        if (kd.pos) {
          ox += kd.pos[0];
          oy += kd.pos[1];
          oz += kd.pos[2];
        }
        if (kd.rot) {
          rx += kd.rot[0];
          ry += kd.rot[1];
          rz += kd.rot[2];
        }
      } else if (tExplode > 1e-4) {
        oy += 4.2 * profile.modelScale * tExplode;
      }

      opticGroupRef.current.position.set(ox, oy, oz);
      opticGroupRef.current.rotation.set(rx, ry, rz);
      opticGroupRef.current.scale.setScalar(profile.modelScale);
    }
  });

  if (
    screen === 'cartridges' ||
    screen === 'ballistics' ||
    (!hasMuzzle && !hasOptic)
  ) {
    return null;
  }

  return (
    <group name="ModularAttachmentRig">
      {hasMuzzle && profile.muzzleAnchor && (
        <group
          ref={muzzleGroupRef}
          position={[
            profile.muzzleAnchor[0],
            profile.muzzleAnchor[1],
            profile.muzzleAnchor[2],
          ]}
          scale={profile.modelScale}
        >
          <MuzzleMeshGroup
            muzzleId={loadout.muzzle}
            clipPlanes={clipPlanes}
            sectionCut={sectionCut}
          />
        </group>
      )}

      {hasOptic && profile.opticRailAnchor && (
        <group
          ref={opticGroupRef}
          position={[
            profile.opticRailAnchor[0],
            profile.opticRailAnchor[1],
            profile.opticRailAnchor[2],
          ]}
          scale={profile.modelScale}
        >
          <OpticMeshGroup
            opticId={loadout.optic}
            clipPlanes={clipPlanes}
            sectionCut={sectionCut}
          />
        </group>
      )}
    </group>
  );
};

AttachmentActor.displayName = 'AttachmentActor';
