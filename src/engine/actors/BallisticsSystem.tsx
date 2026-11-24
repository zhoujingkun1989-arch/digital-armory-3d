import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { getLoadedWeaponPlugin } from '../../weapons/registry';
import type { CaliberProfile, WeaponId } from '../../weapons/types';
import { playbackClock } from '../clock/playbackClock';
import { computeMountedMuzzleExitX } from '../attachments/attachmentSpecs';
import {
  getActiveWeaponAttachmentPhysics,
  getWeaponAttachmentLoadout,
} from '../attachments/attachmentStore';
import { GasFlowVisualizer } from './GasFlowVisualizer';
import {
  SMOKE_WISP_POOL_SIZE,
  SPENT_CASING_POOL_SIZE,
  computeGasPortUncoverF,
  createArmoryPhysicsInput,
  createInternalBallisticsSample,
  evaluateInternalBallisticsInto,
  getArmoryPhysicsState,
  getCaliberBallisticsSpec,
  getSmokeWispPool,
  getSpentCasingPool,
  getWeaponFiringTiming,
  isArcheryWeapon,
  isTankCaliber,
  isTankWeapon,
  stepArmoryPhysics,
} from '../physics/armoryPhysics';

// ============================================================================
// 1:1 SAAMI / CIP Cartridge Case, Projectile & Boxer Primer Lathe Builders
// Zero `three-bvh-csg` imports — lightweight procedural LatheGeometry / Ring
// primitives cached once per caliber for 60fps main-thread rendering.
// Coordinate convention: +X = muzzle, +Y = up, +Z = right flank.
// ============================================================================

interface PrimerPocketSpec {
  xHead: number;
  rPocket: number;
  pocketDepth: number;
}

export interface CaliberGeometryBundle {
  caseGeo: THREE.BufferGeometry;
  bulletGeo: THREE.BufferGeometry;
  livePrimerGeo: THREE.BufferGeometry;
  spentPrimerGeo: THREE.BufferGeometry;
  sootRingGeo: THREE.BufferGeometry;
  craterSootGeo: THREE.BufferGeometry;
  xHead: number;
}

function finalizeLathe(
  pts: THREE.Vector2[],
  segments: number
): THREE.BufferGeometry {
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.rotateZ(-Math.PI / 2);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds the dedicated nickel-plated Boxer primer cup (un-struck live state,
 * firing-pin indented spent state, and carbon-soot gas ring + strike shadow)
 * nestled inside the recessed rear primer pocket of the brass cartridge case.
 */
function buildBoxerPrimerGeometries(spec: PrimerPocketSpec): {
  livePrimerGeo: THREE.BufferGeometry;
  spentPrimerGeo: THREE.BufferGeometry;
  sootRingGeo: THREE.BufferGeometry;
  craterSootGeo: THREE.BufferGeometry;
} {
  const { xHead, rPocket, pocketDepth } = spec;
  const rCup = rPocket * 0.92;
  const xFace = xHead + 0.006;
  const xSkirt = xHead + pocketDepth - 0.004;
  const edgeR = Math.min(0.022, rCup * 0.16);

  // 1. Live un-struck nickel Boxer primer cup (smooth flat face + radiused cup corner)
  const livePts: THREE.Vector2[] = [
    new THREE.Vector2(0, xFace),
    new THREE.Vector2(rCup - edgeR, xFace),
    new THREE.Vector2(rCup - edgeR * 0.32, xFace + edgeR * 0.42),
    new THREE.Vector2(rCup, xFace + edgeR),
    new THREE.Vector2(rCup, xSkirt),
    new THREE.Vector2(0, xSkirt),
  ];
  const livePrimerGeo = finalizeLathe(livePts, 24);

  // 2. Spent Boxer primer cup with deep hemispherical firing-pin strike dimple & raised flow lip
  const rIndent = rCup * 0.46;
  const indentDepth = Math.min(pocketDepth * 0.68, rCup * 0.44);
  const spentPts: THREE.Vector2[] = [
    new THREE.Vector2(0, xFace + indentDepth),
    new THREE.Vector2(rIndent * 0.34, xFace + indentDepth * 0.91),
    new THREE.Vector2(rIndent * 0.66, xFace + indentDepth * 0.62),
    new THREE.Vector2(rIndent * 0.9, xFace + indentDepth * 0.22),
    new THREE.Vector2(rIndent * 1.08, xFace - 0.003), // Plastic-flow raised crater rim
    new THREE.Vector2(rCup - edgeR, xFace),
    new THREE.Vector2(rCup - edgeR * 0.32, xFace + edgeR * 0.42),
    new THREE.Vector2(rCup, xFace + edgeR),
    new THREE.Vector2(rCup, xSkirt),
    new THREE.Vector2(0, xSkirt),
  ];
  const spentPrimerGeo = finalizeLathe(spentPts, 24);

  // 3. Annular carbon-soot gas blowback ring around primer pocket perimeter
  const sootRingGeo = new THREE.RingGeometry(rCup * 0.86, rPocket * 1.16, 24);
  sootRingGeo.rotateY(-Math.PI / 2);
  sootRingGeo.translate(xHead - 0.0018, 0, 0);
  sootRingGeo.computeBoundingBox();
  sootRingGeo.computeBoundingSphere();

  // 4. Dark carbon/anvil burn lining the bottom of the hemispherical firing-pin crater
  const craterPts: THREE.Vector2[] = [
    new THREE.Vector2(0, xFace + indentDepth - 0.002),
    new THREE.Vector2(rIndent * 0.34, xFace + indentDepth * 0.91 - 0.002),
    new THREE.Vector2(rIndent * 0.68, xFace + indentDepth * 0.58 - 0.002),
  ];
  const craterSootGeo = finalizeLathe(craterPts, 20);

  return { livePrimerGeo, spentPrimerGeo, sootRingGeo, craterSootGeo };
}

/**
 * 1. 9×19mm Parabellum (SAAMI / CIP: 19.15mm tapered case, 29.69mm OAL, 9.96mm rim)
 * Case X in [-0.78, +0.78] (1.56u), Cartridge OAL [-0.78, +1.65] (2.43u, OAL/case = 1.558).
 */
function build9mmGeometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -0.78,
    rPocket: 0.178,
    pocketDepth: 0.085,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.695),
    new THREE.Vector2(0.178, -0.695),
    new THREE.Vector2(0.178, -0.768),
    new THREE.Vector2(0.192, -0.78), // Primer pocket crimp chamfer
    new THREE.Vector2(0.384, -0.78), // Flat headstamp face
    new THREE.Vector2(0.406, -0.758), // SAAMI rim entry chamfer
    new THREE.Vector2(0.406, -0.682), // Rim OD (9.96mm)
    new THREE.Vector2(0.341, -0.652), // Extractor hook bevel
    new THREE.Vector2(0.341, -0.562), // Undercut extractor groove (8.35mm)
    new THREE.Vector2(0.405, -0.505), // 40° web ramp (9.93mm)
    new THREE.Vector2(0.399, 0.12), // Tapered straight-wall body
    new THREE.Vector2(0.393, 0.772), // Tapered case mouth OD (9.65mm)
    new THREE.Vector2(0.39, 0.78),
    new THREE.Vector2(0.368, 0.78), // Thin brass mouth wall (0.31mm)
    new THREE.Vector2(0.368, 0.34), // Bullet seating neck ID
    new THREE.Vector2(0.352, -0.36), // Tapered internal propellant web
    new THREE.Vector2(0, -0.36),
  ];

  // 124gr FMJ Round-Nose Tangent-Ogive Projectile (bulletLocalOffset = 1.33 -> tip at +1.65)
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.88),
    new THREE.Vector2(0.348, -0.88), // Bevel base inside case neck
    new THREE.Vector2(0.368, -0.83),
    new THREE.Vector2(0.368, -0.55), // Seated bearing band (flush with +0.78 mouth at -0.55)
    new THREE.Vector2(0.362, -0.44),
    new THREE.Vector2(0.346, -0.26),
    new THREE.Vector2(0.312, -0.08),
    new THREE.Vector2(0.256, 0.08),
    new THREE.Vector2(0.182, 0.21),
    new THREE.Vector2(0.095, 0.29),
    new THREE.Vector2(0, 0.32),
  ];

  return {
    caseGeo: finalizeLathe(casePts, 28),
    bulletGeo: finalizeLathe(bulletPts, 28),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}


/**
 * 2. 7.62×39mm M43 (CIP: 38.70mm steep-taper case, 56.00mm OAL, 16°36' shoulder)
 * Case X in [-1.10, +1.10] (2.20u), Cartridge OAL [-1.10, +2.08] (3.18u, OAL/case = 1.445).
 */
function build762Geometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -1.1,
    rPocket: 0.151,
    pocketDepth: 0.095,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.005),
    new THREE.Vector2(0.151, -1.005),
    new THREE.Vector2(0.151, -1.088),
    new THREE.Vector2(0.165, -1.1),
    new THREE.Vector2(0.302, -1.1),
    new THREE.Vector2(0.323, -1.078), // Rim entry chamfer
    new THREE.Vector2(0.323, -1.005), // Rim OD (11.35mm)
    new THREE.Vector2(0.272, -0.978),
    new THREE.Vector2(0.272, -0.895), // Deep M43 extractor groove (9.65mm)
    new THREE.Vector2(0.323, -0.84), // Base web (11.35mm)
    new THREE.Vector2(0.304, -0.08), // Pronounced M43 body taper
    new THREE.Vector2(0.285, 0.62), // Shoulder datum
    new THREE.Vector2(0.244, 0.76), // 16.5° CIP shoulder angle
    new THREE.Vector2(0.243, 1.092), // Bottleneck OD (8.56mm)
    new THREE.Vector2(0.24, 1.1),
    new THREE.Vector2(0.224, 1.1), // Neck mouth wall thickness
    new THREE.Vector2(0.224, 0.72),
    new THREE.Vector2(0.254, 0.56),
    new THREE.Vector2(0, 0.56),
  ];

  // 123gr 57-N-231 Boat-Tail Spitzer w/ Cannelure (bulletLocalOffset = 1.85 -> tip at +2.08)
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.16),
    new THREE.Vector2(0.182, -1.16), // 9° boat-tail base
    new THREE.Vector2(0.224, -1.01), // Bearing band inside neck
    new THREE.Vector2(0.224, -0.77),
    new THREE.Vector2(0.214, -0.75), // Crimped cannelure at case mouth (+1.10)
    new THREE.Vector2(0.223, -0.72),
    new THREE.Vector2(0.214, -0.54),
    new THREE.Vector2(0.188, -0.32),
    new THREE.Vector2(0.146, -0.1),
    new THREE.Vector2(0.092, 0.08),
    new THREE.Vector2(0.036, 0.195),
    new THREE.Vector2(0, 0.23),
  ];

  return {
    caseGeo: finalizeLathe(casePts, 28),
    bulletGeo: finalizeLathe(bulletPts, 28),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}


/**
 * 3. 5.56×45mm NATO M855 (STANAG 4172: 44.70mm case, 57.40mm OAL, 23° shoulder)
 * Case X in [-1.22, +1.22] (2.44u), Cartridge OAL [-1.22, +1.92] (3.14u, OAL/case = 1.287).
 */
function build556Geometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -1.22,
    rPocket: 0.121,
    pocketDepth: 0.092,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.128),
    new THREE.Vector2(0.121, -1.128),
    new THREE.Vector2(0.121, -1.208),
    new THREE.Vector2(0.133, -1.22),
    new THREE.Vector2(0.244, -1.22),
    new THREE.Vector2(0.262, -1.201), // Rim entry chamfer
    new THREE.Vector2(0.262, -1.132), // Rim OD (9.60mm)
    new THREE.Vector2(0.226, -1.106),
    new THREE.Vector2(0.226, -1.022), // Extractor groove (8.43mm)
    new THREE.Vector2(0.261, -0.972), // Web OD (9.58mm)
    new THREE.Vector2(0.254, -0.05),
    new THREE.Vector2(0.246, 0.77), // Shoulder start (36.5mm)
    new THREE.Vector2(0.175, 0.94), // Exact 23° STANAG shoulder angle
    new THREE.Vector2(0.174, 1.213), // Case neck OD (6.43mm)
    new THREE.Vector2(0.171, 1.22),
    new THREE.Vector2(0.156, 1.22), // Neck mouth ID (5.70mm)
    new THREE.Vector2(0.156, 0.9),
    new THREE.Vector2(0.205, 0.72),
    new THREE.Vector2(0, 0.72),
  ];

  // 62gr M855 SS109 Penetrator Boat-Tail Spitzer (bulletLocalOffset = 1.98 -> tip at +1.92)
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.16),
    new THREE.Vector2(0.124, -1.16), // 9° boat-tail base
    new THREE.Vector2(0.156, -1.01), // Bearing surface inside neck
    new THREE.Vector2(0.156, -0.78),
    new THREE.Vector2(0.148, -0.76), // Cannelure crimped at case mouth (+1.22)
    new THREE.Vector2(0.155, -0.73),
    new THREE.Vector2(0.148, -0.58),
    new THREE.Vector2(0.128, -0.4),
    new THREE.Vector2(0.095, -0.24),
    new THREE.Vector2(0.052, -0.12),
    new THREE.Vector2(0.018, -0.072),
    new THREE.Vector2(0, -0.06),
  ];

  return {
    caseGeo: finalizeLathe(casePts, 28),
    bulletGeo: finalizeLathe(bulletPts, 26),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

/**
 * 4. .338 Lapua Magnum / 8.6×70mm (CIP: 69.20mm case, 93.50mm OAL, 20° shoulder)
 * Case X in [-1.62, +1.68] (3.30u), Cartridge OAL [-1.62, +2.93] (4.55u, OAL/case = 1.379).
 */
function build338LapuaGeometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -1.62,
    rPocket: 0.132,
    pocketDepth: 0.105,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.515),
    new THREE.Vector2(0.132, -1.515),
    new THREE.Vector2(0.132, -1.606),
    new THREE.Vector2(0.148, -1.62),
    new THREE.Vector2(0.34, -1.62),
    new THREE.Vector2(0.362, -1.596), // Rim entry chamfer
    new THREE.Vector2(0.362, -1.5), // Heavy .338 LM rim (14.93mm)
    new THREE.Vector2(0.312, -1.462),
    new THREE.Vector2(0.312, -1.345), // Undercut extractor groove (13.05mm)
    new THREE.Vector2(0.361, -1.28), // Thick magnum pressure web
    new THREE.Vector2(0.348, 0.05),
    new THREE.Vector2(0.335, 1.02), // Shoulder start
    new THREE.Vector2(0.239, 1.284), // Exact 20° CIP shoulder angle
    new THREE.Vector2(0.238, 1.67), // Neck OD (9.80mm)
    new THREE.Vector2(0.234, 1.68),
    new THREE.Vector2(0.21, 1.68), // Neck mouth wall thickness
    new THREE.Vector2(0.21, 1.24),
    new THREE.Vector2(0.285, 0.98),
    new THREE.Vector2(0, 0.98),
  ];

  // 250gr Lapua Scenar VLD Secant-Ogive Boat-Tail (bulletLocalOffset = 2.75 -> tip at +2.93)
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.38),
    new THREE.Vector2(0.162, -1.38), // Long VLD boat-tail base
    new THREE.Vector2(0.21, -1.16), // Bearing band inside neck
    new THREE.Vector2(0.21, -1.07), // Exits case mouth (+1.68) seamlessly
    new THREE.Vector2(0.204, -0.88),
    new THREE.Vector2(0.184, -0.62),
    new THREE.Vector2(0.15, -0.34),
    new THREE.Vector2(0.105, -0.08),
    new THREE.Vector2(0.052, 0.1),
    new THREE.Vector2(0.016, 0.165), // Hollow-point / match meplat tip
    new THREE.Vector2(0, 0.18),
  ];

  return {
    caseGeo: finalizeLathe(casePts, 30),
    bulletGeo: finalizeLathe(bulletPts, 28),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

/**
 * 5. .50 BMG / 12.7×99mm NATO M33 (US Mil-Spec: 99.31mm case, 138.43mm OAL, 15°49' shoulder)
 * Case X in [-2.25, +2.25] (4.50u), Cartridge OAL [-2.25, +4.03] (6.28u, OAL/case = 1.396).
 */
function build50BmgGeometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -2.25,
    rPocket: 0.182,
    pocketDepth: 0.135,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -2.115),
    new THREE.Vector2(0.182, -2.115),
    new THREE.Vector2(0.182, -2.232),
    new THREE.Vector2(0.202, -2.25), // Arsenal #35 staked primer crimp bevel
    new THREE.Vector2(0.436, -2.25), // Flat .50 BMG headstamp face
    new THREE.Vector2(0.463, -2.22), // Mil-Spec rim entry chamfer
    new THREE.Vector2(0.463, -2.095), // Rim OD (20.42mm)
    new THREE.Vector2(0.398, -2.045), // 45° extractor claw bevel
    new THREE.Vector2(0.398, -1.875), // Deep undercut extractor groove (17.91mm)
    new THREE.Vector2(0.463, -1.79), // Heavy case head web (20.42mm)
    new THREE.Vector2(0.446, -0.25),
    new THREE.Vector2(0.427, 1.29), // Shoulder datum (78.2mm)
    new THREE.Vector2(0.319, 1.67), // Exact 15°49' (15.82°) .50 BMG shoulder
    new THREE.Vector2(0.317, 2.238), // Long .50 BMG neck OD (14.00mm)
    new THREE.Vector2(0.312, 2.25),
    new THREE.Vector2(0.293, 2.25), // Case mouth ID (12.98mm)
    new THREE.Vector2(0.293, 1.62),
    new THREE.Vector2(0.375, 1.24),
    new THREE.Vector2(0, 1.24),
  ];

  // 660gr M33 Ball Secant-Ogive Boat-Tail w/ Cannelure (bulletLocalOffset = 3.45 -> tip at +4.03)
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -2.06),
    new THREE.Vector2(0.228, -2.06), // 9° M33 boat-tail base
    new THREE.Vector2(0.294, -1.68), // Full-caliber bearing band inside neck
    new THREE.Vector2(0.294, -1.23),
    new THREE.Vector2(0.281, -1.2), // Knurled crimp cannelure right at +2.25 case mouth!
    new THREE.Vector2(0.293, -1.16),
    new THREE.Vector2(0.282, -0.86),
    new THREE.Vector2(0.252, -0.48),
    new THREE.Vector2(0.202, -0.1),
    new THREE.Vector2(0.136, 0.24),
    new THREE.Vector2(0.062, 0.48),
    new THREE.Vector2(0.018, 0.565),
    new THREE.Vector2(0, 0.58),
  ];

  return {
    caseGeo: finalizeLathe(casePts, 32),
    bulletGeo: finalizeLathe(bulletPts, 30),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

/**
 * 6. .50 Action Express (SAAMI: 32.64mm rebated-rim case, 40.89mm OAL, 300gr JHP)
 * Case X in [-1.18, +1.18] (2.36u), Cartridge OAL [-1.18, +1.78] (2.96u, OAL/case = 1.254).
 * Signature SAAMI Rebated Rim: rim r=0.472 (13.06mm) < web r=0.502 (13.89mm)!
 */
function build50AeGeometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -1.18,
    rPocket: 0.192,
    pocketDepth: 0.1,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.08),
    new THREE.Vector2(0.192, -1.08),
    new THREE.Vector2(0.192, -1.166),
    new THREE.Vector2(0.208, -1.18),
    new THREE.Vector2(0.448, -1.18),
    new THREE.Vector2(0.472, -1.156), // Rebated rim chamfer
    new THREE.Vector2(0.472, -1.06), // Rebated rim OD (13.06mm — .44 Mag bolt face!)
    new THREE.Vector2(0.402, -1.028),
    new THREE.Vector2(0.402, -0.915), // Deep undercut extractor groove (11.18mm)
    new THREE.Vector2(0.502, -0.835), // Steps OUTWARD to fat .50 AE base web (13.89mm)!
    new THREE.Vector2(0.499, 0.2),
    new THREE.Vector2(0.496, 1.17), // Tapered straight-wall mouth OD (13.72mm)
    new THREE.Vector2(0.491, 1.18),
    new THREE.Vector2(0.459, 1.18), // Mouth ID (12.70mm)
    new THREE.Vector2(0.459, 0.56),
    new THREE.Vector2(0.44, -0.35),
    new THREE.Vector2(0, -0.35),
  ];

  // 300gr Jacketed Hollow Point (JHP) Truncated Cone w/ Expansion Cavity (bulletLocalOffset = 1.58)
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.84),
    new THREE.Vector2(0.442, -0.84),
    new THREE.Vector2(0.459, -0.78), // Seated shank inside case mouth
    new THREE.Vector2(0.459, -0.4), // Exits +1.18 case mouth seamlessly
    new THREE.Vector2(0.432, -0.22),
    new THREE.Vector2(0.378, -0.02),
    new THREE.Vector2(0.305, 0.16),
    new THREE.Vector2(0.268, 0.2), // Skived copper jacket JHP rim (+1.78)
    new THREE.Vector2(0.205, 0.195), // Hollow-point mouth bevel
    new THREE.Vector2(0.145, 0.04), // Deep JHP expansion cavity wall
    new THREE.Vector2(0, -0.02), // Hollow-point cavity floor
  ];

  return {
    caseGeo: finalizeLathe(casePts, 30),
    bulletGeo: finalizeLathe(bulletPts, 28),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

/**
 * 7. 5.7×28mm FN SS190 PDW (CIP / STANAG 4509: 28.90mm bottleneck case, 40.50mm OAL, 35° shoulder)
 * Case X in [-0.96, +0.96] (1.92u), Cartridge OAL [-0.96, +1.73] (2.69u, OAL/case = 1.401).
 * Polymer-lacquered straight-wall case w/ sharp bottleneck & high-velocity 31gr SS190 spitzer!
 */
function build57x28Geometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -0.96,
    rPocket: 0.114,
    pocketDepth: 0.082,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.878),
    new THREE.Vector2(0.114, -0.878),
    new THREE.Vector2(0.114, -0.949),
    new THREE.Vector2(0.125, -0.96),
    new THREE.Vector2(0.222, -0.96),
    new THREE.Vector2(0.236, -0.942), // CIP rim entry chamfer
    new THREE.Vector2(0.236, -0.874), // Narrow 7.80mm rim for 50-rd double-row horizontal stack
    new THREE.Vector2(0.198, -0.848),
    new THREE.Vector2(0.198, -0.768), // Deep extractor groove (6.35mm) for straight-blowback extraction
    new THREE.Vector2(0.238, -0.718), // Straight cylindrical body OD (7.92mm — minimal taper!)
    new THREE.Vector2(0.236, 0.48), // Long cylindrical propellant body
    new THREE.Vector2(0.234, 0.58), // Steep 35° FN shoulder datum
    new THREE.Vector2(0.172, 0.71), // Sharp bottleneck shoulder transition
    new THREE.Vector2(0.171, 0.952), // Case neck OD (6.35mm)
    new THREE.Vector2(0.168, 0.96),
    new THREE.Vector2(0.154, 0.96), // Neck mouth ID (5.70mm)
    new THREE.Vector2(0.154, 0.68),
    new THREE.Vector2(0.198, 0.54),
    new THREE.Vector2(0, 0.54),
  ];

  // 31gr FN SS190 Steel-Penetrator / Aluminum-Core Spitzer Boat-Tail (bulletLocalOffset = 1.48 -> tip at +1.73)
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.92),
    new THREE.Vector2(0.124, -0.92), // Boat-tail base
    new THREE.Vector2(0.154, -0.78), // Bearing band seated in bonded neck
    new THREE.Vector2(0.154, -0.52), // Exits +0.96 case mouth cleanly
    new THREE.Vector2(0.146, -0.36),
    new THREE.Vector2(0.126, -0.18),
    new THREE.Vector2(0.094, 0.0),
    new THREE.Vector2(0.054, 0.14),
    new THREE.Vector2(0.018, 0.232),
    new THREE.Vector2(0, 0.25),
  ];

  return {
    caseGeo: finalizeLathe(casePts, 28),
    bulletGeo: finalizeLathe(bulletPts, 26),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

/**
 * 8. .357 S&W Magnum (SAAMI: 32.77mm straight-wall rimmed case, 40.39mm OAL, 11.18mm solid rim)
 * Case X in [-1.02, +1.02] (2.04u), 158gr JSP flat-nose soft-point in bulletGeo [-0.24, +0.78].
 */
function build357MagnumGeometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -1.02,
    rPocket: 0.175,
    pocketDepth: 0.088,
  };
  const brassWallPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.932),
    new THREE.Vector2(0.175, -0.932),
    new THREE.Vector2(0.175, -1.008),
    new THREE.Vector2(0.19, -1.02),
    // Solid protruding revolver rim (R = 0.415 > body R = 0.362)
    new THREE.Vector2(0.398, -1.02),
    new THREE.Vector2(0.415, -1.004),
    new THREE.Vector2(0.415, -0.942),
    new THREE.Vector2(0.364, -0.932),
    // Straight-walled .357 Magnum cylinder body up to case cannelure
    new THREE.Vector2(0.362, 0.16),
    new THREE.Vector2(0.346, 0.185),
    new THREE.Vector2(0.346, 0.225),
    new THREE.Vector2(0.36, 0.25),
    new THREE.Vector2(0.358, 1.02),
    new THREE.Vector2(0.326, 1.02),
    new THREE.Vector2(0.326, 0.45),
    new THREE.Vector2(0, 0.45),
  ];
  const nickelBandPts: THREE.Vector2[] = [
    new THREE.Vector2(0.347, 0.182),
    new THREE.Vector2(0.363, 0.182),
    new THREE.Vector2(0.363, 0.228),
    new THREE.Vector2(0.347, 0.228),
  ];
  const caseParts = [
    paintSubGeo(finalizeLathe(brassWallPts, 28), '#e6b938'),
    paintSubGeo(finalizeLathe(nickelBandPts, 28), '#e2e8f0'),
  ];
  const caseGeo = mergeGeometries(caseParts, false);
  for (const p of caseParts) p.dispose();
  caseGeo.computeBoundingBox();
  caseGeo.computeBoundingSphere();

  // 158gr Jacketed Soft-Point (JSP): gilding-copper semi-jacket + exposed soft-lead flat meplat
  const jacketPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.24),
    new THREE.Vector2(0.322, -0.24),
    new THREE.Vector2(0.332, -0.18),
    new THREE.Vector2(0.332, 0.24),
    new THREE.Vector2(0.305, 0.46),
    new THREE.Vector2(0.245, 0.56),
    new THREE.Vector2(0, 0.56),
  ];
  const softLeadTipPts: THREE.Vector2[] = [
    new THREE.Vector2(0, 0.54),
    new THREE.Vector2(0.242, 0.56),
    new THREE.Vector2(0.195, 0.72),
    new THREE.Vector2(0.145, 0.78),
    new THREE.Vector2(0, 0.78),
  ];
  const bulletParts = [
    paintSubGeo(finalizeLathe(jacketPts, 24), '#c2511a'),
    paintSubGeo(finalizeLathe(softLeadTipPts, 24), '#94a3b8'),
  ];
  const bulletGeo = mergeGeometries(bulletParts, false);
  for (const p of bulletParts) p.dispose();
  bulletGeo.computeBoundingBox();
  bulletGeo.computeBoundingSphere();

  return {
    caseGeo,
    bulletGeo,
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

/**
 * 9. 12 Gauge 2.75" (70mm) 00 Buckshot Combat Shotshell (SAAMI: 22.48mm rim, 20.2mm hull):
 * C26000 high-brass headstamp cup + crimson ribbed polymer hull in `caseGeo` [-0.82, +0.82],
 * slotted white shot-cup wad + 9-pellet 00 lead buckshot cluster in `bulletGeo` [-0.42, +0.52].
 */
function build12GaugeGeometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -0.82,
    rPocket: 0.165,
    pocketDepth: 0.085,
  };
  // High-brass 16mm metallic headstamp base with extruded shotgun extractor rim
  const highBrassPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.735),
    new THREE.Vector2(0.165, -0.735),
    new THREE.Vector2(0.165, -0.808),
    new THREE.Vector2(0.18, -0.82),
    new THREE.Vector2(0.442, -0.82),
    new THREE.Vector2(0.46, -0.802),
    new THREE.Vector2(0.46, -0.745),
    new THREE.Vector2(0.418, -0.732),
    new THREE.Vector2(0.418, -0.34),
    new THREE.Vector2(0.382, -0.34),
    new THREE.Vector2(0, -0.34),
  ];
  // Crimson ribbed polymer hull with subtle crimp shoulder bevel
  const crimsonHullPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.35),
    new THREE.Vector2(0.412, -0.35),
    new THREE.Vector2(0.412, 0.74),
    new THREE.Vector2(0.392, 0.82),
    new THREE.Vector2(0.335, 0.82),
    new THREE.Vector2(0.335, 0.32),
    new THREE.Vector2(0, 0.32),
  ];
  const caseParts = [
    paintSubGeo(finalizeLathe(highBrassPts, 28), '#e6b83a'),
    paintSubGeo(finalizeLathe(crimsonHullPts, 28), '#b91c1c'),
  ];
  const caseGeo = mergeGeometries(caseParts, false);
  for (const p of caseParts) p.dispose();
  caseGeo.computeBoundingBox();
  caseGeo.computeBoundingSphere();

  // Slotted polyethylene shot-cup wad + 9-pellet 00 buckshot cluster (3 layers × 3 pellets)
  const wadPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.42),
    new THREE.Vector2(0.325, -0.42),
    new THREE.Vector2(0.332, -0.18),
    new THREE.Vector2(0.285, -0.14),
    new THREE.Vector2(0.328, -0.08),
    new THREE.Vector2(0.328, 0.08),
    new THREE.Vector2(0.275, 0.08),
    new THREE.Vector2(0.275, -0.05),
    new THREE.Vector2(0, -0.05),
  ];
  const bulletParts: THREE.BufferGeometry[] = [
    paintSubGeo(finalizeLathe(wadPts, 22), '#e2e8f0'),
  ];
  const layerXs = [0.06, 0.23, 0.4];
  for (let li = 0; li < 3; li++) {
    const twist = li * (Math.PI / 3);
    const rRing = 0.145;
    for (let k = 0; k < 3; k++) {
      const a = twist + (k * Math.PI * 2) / 3;
      const pellet = new THREE.SphereGeometry(0.115, 10, 8);
      pellet.translate(layerXs[li], Math.cos(a) * rRing, Math.sin(a) * rRing);
      bulletParts.push(paintSubGeo(pellet, '#94a3b8'));
    }
  }
  const bulletGeo = mergeGeometries(bulletParts, false);
  for (const p of bulletParts) p.dispose();
  bulletGeo.computeBoundingBox();
  bulletGeo.computeBoundingSphere();

  return {
    caseGeo,
    bulletGeo,
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

/**
 * 10. .30-06 Springfield M2 Ball (SAAMI: 63.35mm bottleneck case, 84.84mm OAL, 17°30' shoulder)
 * Case X in [-1.45, +1.45] (2.90u), 150gr M2 gilding-metal spitzer in bulletGeo [-0.42, +0.96].
 */
function build3006Geometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -1.45,
    rPocket: 0.132,
    pocketDepth: 0.085,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.365),
    new THREE.Vector2(0.132, -1.365),
    new THREE.Vector2(0.132, -1.438),
    new THREE.Vector2(0.145, -1.45),
    new THREE.Vector2(0.268, -1.45),
    new THREE.Vector2(0.275, -1.435),
    new THREE.Vector2(0.275, -1.375),
    // Deep rimless extractor groove
    new THREE.Vector2(0.228, -1.355),
    new THREE.Vector2(0.228, -1.29),
    new THREE.Vector2(0.274, -1.255),
    // Long gently tapered .30-06 brass body
    new THREE.Vector2(0.26, 0.86),
    // Classic 17°30' Springfield shoulder
    new THREE.Vector2(0.172, 1.08),
    // Long .308" neck
    new THREE.Vector2(0.17, 1.45),
    new THREE.Vector2(0.152, 1.45),
    new THREE.Vector2(0.152, 1.05),
    new THREE.Vector2(0, 1.05),
  ];
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.42),
    new THREE.Vector2(0.146, -0.42),
    new THREE.Vector2(0.154, -0.34),
    new THREE.Vector2(0.154, 0.14),
    new THREE.Vector2(0.132, 0.42),
    new THREE.Vector2(0.088, 0.68),
    new THREE.Vector2(0.036, 0.88),
    new THREE.Vector2(0.012, 0.945),
    new THREE.Vector2(0, 0.96),
  ];

  return {
    caseGeo: finalizeLathe(casePts, 26),
    bulletGeo: finalizeLathe(bulletPts, 24),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

/**
 * 10b. .30-30 Winchester 170gr Flat-Nose (SAAMI: 51.79mm rimmed bottleneck case, 64.77mm OAL)
 */
function build3030WinGeometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -1.18,
    rPocket: 0.132,
    pocketDepth: 0.085,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.095),
    new THREE.Vector2(0.132, -1.095),
    new THREE.Vector2(0.132, -1.168),
    new THREE.Vector2(0.145, -1.18),
    new THREE.Vector2(0.32, -1.18), // Iconic wide Winchester .30-30 rimmed base!
    new THREE.Vector2(0.325, -1.12),
    new THREE.Vector2(0.268, -1.1),
    new THREE.Vector2(0.264, 0.56),
    new THREE.Vector2(0.174, 0.86),
    new THREE.Vector2(0.172, 1.18),
    new THREE.Vector2(0.154, 1.18),
    new THREE.Vector2(0.154, 0.84),
    new THREE.Vector2(0, 0.84),
  ];
  // 170gr Flat-Nose Soft-Point for tubular magazine safety
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.34),
    new THREE.Vector2(0.148, -0.34),
    new THREE.Vector2(0.155, -0.26),
    new THREE.Vector2(0.155, 0.24),
    new THREE.Vector2(0.135, 0.46),
    new THREE.Vector2(0.088, 0.66),
    new THREE.Vector2(0.068, 0.72),
    new THREE.Vector2(0, 0.72),
  ];

  return {
    caseGeo: finalizeLathe(casePts, 26),
    bulletGeo: finalizeLathe(bulletPts, 24),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

/**
 * 11. .45 ACP / 11.43×23mm (SAAMI: 22.81mm straight-wall rimless case, 32.39mm OAL, 230gr FMJ-RN)
 * Case X in [-0.92, +0.92] (1.84u), Cartridge OAL [-0.92, +1.70] (2.62u, OAL/case = 1.424).
 */
function build45AcpGeometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -0.92,
    rPocket: 0.212, // Large Pistol Boxer primer (Ø5.33mm)
    pocketDepth: 0.092,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.828),
    new THREE.Vector2(0.212, -0.828),
    new THREE.Vector2(0.212, -0.908),
    new THREE.Vector2(0.228, -0.92),
    new THREE.Vector2(0.464, -0.92), // Wide .45 ACP headstamp face
    new THREE.Vector2(0.488, -0.896), // Rim entry chamfer
    new THREE.Vector2(0.488, -0.82), // Rim OD (12.19mm)
    new THREE.Vector2(0.412, -0.788),
    new THREE.Vector2(0.412, -0.688), // Deep rimless extractor groove (10.39mm)
    new THREE.Vector2(0.484, -0.625), // Base web OD (12.09mm)
    new THREE.Vector2(0.482, 0.15), // Nearly cylindrical straight-wall .45 brass body
    new THREE.Vector2(0.48, 0.912), // Case mouth OD (12.01mm — headspaces on mouth!)
    new THREE.Vector2(0.476, 0.92),
    new THREE.Vector2(0.459, 0.92), // Case mouth ID (11.48mm)
    new THREE.Vector2(0.459, 0.32),
    new THREE.Vector2(0.442, -0.45),
    new THREE.Vector2(0, -0.45),
  ];

  // 230gr Copper-Jacketed Hardball Round-Nose Projectile (bulletLocalOffset = 1.36 -> tip at +1.70)
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.88),
    new THREE.Vector2(0.44, -0.88),
    new THREE.Vector2(0.459, -0.82), // Seated full-caliber bearing shank
    new THREE.Vector2(0.459, -0.44), // Flush with +0.92 case mouth at -0.44
    new THREE.Vector2(0.452, -0.3),
    new THREE.Vector2(0.428, -0.12),
    new THREE.Vector2(0.382, 0.05),
    new THREE.Vector2(0.308, 0.19),
    new THREE.Vector2(0.205, 0.285),
    new THREE.Vector2(0.095, 0.33),
    new THREE.Vector2(0, 0.34),
  ];

  return {
    caseGeo: finalizeLathe(casePts, 28),
    bulletGeo: finalizeLathe(bulletPts, 28),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

/**
 * 10. 4.73×33mm DM11 Caseless Telescoped (H&K G11 K2):
 * Chamfered 8×8mm square molded HITP combustible propellant block `X ∈ [-1.58, +1.58]`
 * with telescoped slender 4.73mm copper spitzer tip emerging to `+1.72` (OAL 3.30u = 33.0 mm).
 */
function build473CaselessGeometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -1.58,
    rPocket: 0.19,
    pocketDepth: 0.085,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.495),
    new THREE.Vector2(0.19, -1.495),
    new THREE.Vector2(0.19, -1.568),
    new THREE.Vector2(0.205, -1.58),
    new THREE.Vector2(0.36, -1.58),
    new THREE.Vector2(0.39, -1.54),
    new THREE.Vector2(0.39, 1.54),
    new THREE.Vector2(0.36, 1.58),
    new THREE.Vector2(0.245, 1.58),
    new THREE.Vector2(0.245, 1.25),
    new THREE.Vector2(0, 1.25),
  ];
  const caseGeo = finalizeLathe(casePts, 32);
  // Morph cylindrical outer propellant body into H&K DM11 chamfered square block in YZ
  const pos = caseGeo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(y, z);
    if (r > 0.27) {
      const ay = Math.abs(y) / r;
      const az = Math.abs(z) / r;
      const scale = Math.min(
        1 / Math.max(1e-4, ay),
        1 / Math.max(1e-4, az),
        1.72 / Math.max(1e-4, ay + az)
      );
      pos.setY(i, y * scale);
      pos.setZ(i, z * scale);
    }
  }
  pos.needsUpdate = true;
  caseGeo.computeVertexNormals();
  caseGeo.computeBoundingBox();
  caseGeo.computeBoundingSphere();

  // Telescoped 50gr 4.73mm Copper Boat-Tail Spitzer (bulletLocalOffset = 1.48 -> tip at +1.72)
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -2.18),
    new THREE.Vector2(0.175, -2.18),
    new THREE.Vector2(0.236, -1.96),
    new THREE.Vector2(0.236, -0.58),
    new THREE.Vector2(0.21, -0.34),
    new THREE.Vector2(0.152, -0.08),
    new THREE.Vector2(0.082, 0.12),
    new THREE.Vector2(0.025, 0.21),
    new THREE.Vector2(0, 0.24),
  ];

  return {
    caseGeo,
    bulletGeo: finalizeLathe(bulletPts, 24),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

/**
 * 11. 9×39mm SP-6 Subsonic AP (CIP: 39.0mm tapered steel case, 56.0mm OAL, heavy Ø9.25mm AP bullet)
 */
function build9x39Geometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -1.12,
    rPocket: 0.152,
    pocketDepth: 0.095,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.025),
    new THREE.Vector2(0.152, -1.025),
    new THREE.Vector2(0.152, -1.108),
    new THREE.Vector2(0.166, -1.12),
    new THREE.Vector2(0.305, -1.12),
    new THREE.Vector2(0.325, -1.098),
    new THREE.Vector2(0.325, -1.025),
    new THREE.Vector2(0.274, -0.998),
    new THREE.Vector2(0.274, -0.915),
    new THREE.Vector2(0.325, -0.86),
    new THREE.Vector2(0.312, -0.05),
    new THREE.Vector2(0.304, 0.68),
    new THREE.Vector2(0.285, 0.8),
    new THREE.Vector2(0.285, 1.112),
    new THREE.Vector2(0.282, 1.12),
    new THREE.Vector2(0.268, 1.12),
    new THREE.Vector2(0.268, 0.72),
    new THREE.Vector2(0.282, 0.56),
    new THREE.Vector2(0, 0.56),
  ];

  // Heavy 250gr SP-6 Subsonic Hardened-Core Spitzer (bulletLocalOffset = 1.88 -> tip at +2.10)
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.24),
    new THREE.Vector2(0.228, -1.24),
    new THREE.Vector2(0.268, -1.08),
    new THREE.Vector2(0.268, -0.76),
    new THREE.Vector2(0.258, -0.52),
    new THREE.Vector2(0.226, -0.26),
    new THREE.Vector2(0.168, -0.04),
    new THREE.Vector2(0.095, 0.12),
    new THREE.Vector2(0.032, 0.195),
    new THREE.Vector2(0, 0.22),
  ];

  return {
    caseGeo: finalizeLathe(casePts, 28),
    bulletGeo: finalizeLathe(bulletPts, 28),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

/**
 * 12. 5.45×39mm 7N6 Soviet Intermediate (CIP: 39.82mm tapered steel case, 57.00mm OAL)
 */
function build545M74Geometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -1.14,
    rPocket: 0.132,
    pocketDepth: 0.092,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.048),
    new THREE.Vector2(0.132, -1.048),
    new THREE.Vector2(0.132, -1.128),
    new THREE.Vector2(0.145, -1.14),
    new THREE.Vector2(0.268, -1.14),
    new THREE.Vector2(0.285, -1.12),
    new THREE.Vector2(0.285, -1.05),
    new THREE.Vector2(0.242, -1.022),
    new THREE.Vector2(0.242, -0.942),
    new THREE.Vector2(0.285, -0.89),
    new THREE.Vector2(0.274, -0.08),
    new THREE.Vector2(0.264, 0.64),
    new THREE.Vector2(0.18, 0.82),
    new THREE.Vector2(0.179, 1.132),
    new THREE.Vector2(0.176, 1.14),
    new THREE.Vector2(0.161, 1.14),
    new THREE.Vector2(0.161, 0.8),
    new THREE.Vector2(0.222, 0.62),
    new THREE.Vector2(0, 0.62),
  ];

  // Slender 53gr 7N6 Boat-Tail Spitzer (bulletLocalOffset = 1.90 -> tip at +2.12)
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.18),
    new THREE.Vector2(0.128, -1.18),
    new THREE.Vector2(0.161, -1.02),
    new THREE.Vector2(0.161, -0.76),
    new THREE.Vector2(0.155, -0.54),
    new THREE.Vector2(0.132, -0.28),
    new THREE.Vector2(0.092, -0.04),
    new THREE.Vector2(0.045, 0.13),
    new THREE.Vector2(0.015, 0.2),
    new THREE.Vector2(0, 0.22),
  ];

  return {
    caseGeo: finalizeLathe(casePts, 28),
    bulletGeo: finalizeLathe(bulletPts, 26),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

/**
 * 13. 7.62×51mm NATO M80 Ball (STANAG 2310: 51.18mm case, 71.12mm OAL, 20° shoulder)
 */
function build762NatoGeometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -1.45,
    rPocket: 0.152,
    pocketDepth: 0.1,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.35),
    new THREE.Vector2(0.152, -1.35),
    new THREE.Vector2(0.152, -1.436),
    new THREE.Vector2(0.168, -1.45),
    new THREE.Vector2(0.322, -1.45),
    new THREE.Vector2(0.342, -1.428),
    new THREE.Vector2(0.342, -1.348),
    new THREE.Vector2(0.288, -1.314),
    new THREE.Vector2(0.288, -1.215),
    new THREE.Vector2(0.34, -1.158),
    new THREE.Vector2(0.334, -0.1),
    new THREE.Vector2(0.326, 0.88),
    new THREE.Vector2(0.248, 1.12),
    new THREE.Vector2(0.247, 1.442),
    new THREE.Vector2(0.244, 1.45),
    new THREE.Vector2(0.224, 1.45),
    new THREE.Vector2(0.224, 1.08),
    new THREE.Vector2(0.282, 0.84),
    new THREE.Vector2(0, 0.84),
  ];

  // 147gr M80 NATO Boat-Tail Spitzer (bulletLocalOffset = 2.28 -> tip at +2.60)
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.28),
    new THREE.Vector2(0.184, -1.28),
    new THREE.Vector2(0.224, -1.1),
    new THREE.Vector2(0.224, -0.83),
    new THREE.Vector2(0.214, -0.62),
    new THREE.Vector2(0.188, -0.34),
    new THREE.Vector2(0.142, -0.06),
    new THREE.Vector2(0.082, 0.16),
    new THREE.Vector2(0.028, 0.28),
    new THREE.Vector2(0, 0.32),
  ];

  return {
    caseGeo: finalizeLathe(casePts, 28),
    bulletGeo: finalizeLathe(bulletPts, 28),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

const _archeryColor = new THREE.Color();

function paintSubGeo(
  geo: THREE.BufferGeometry,
  hexColor: string
): THREE.BufferGeometry {
  const nonIdx = geo.index ? geo.toNonIndexed() : geo;
  if (nonIdx !== geo) geo.dispose();
  if (!nonIdx.getAttribute('normal')) nonIdx.computeVertexNormals();
  const pos = nonIdx.getAttribute('position');
  const count = pos.count;
  if (!nonIdx.getAttribute('uv')) {
    nonIdx.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array(count * 2), 2)
    );
  }
  _archeryColor.set(hexColor);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = _archeryColor.r;
    colors[i * 3 + 1] = _archeryColor.g;
    colors[i * 3 + 2] = _archeryColor.b;
  }
  nonIdx.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return nonIdx;
}

function buildHelicalVaneGeo(
  xStart: number,
  xEnd: number,
  rShaft: number,
  rOuter: number,
  angleRad: number,
  helicalTwistRad: number,
  hexColor: string
): THREE.BufferGeometry {
  const len = xEnd - xStart;
  const h = rOuter - rShaft;
  const vane = new THREE.BoxGeometry(len, h, 0.045, 6, 1, 1);
  vane.translate(xStart + len * 0.5, rShaft + h * 0.45, 0);
  const pos = vane.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = Math.min(1, Math.max(0, (x - xStart) / Math.max(1e-4, len)));
    // Taper front & rear vane leading edge into shaft cleanly
    const profileScale =
      u < 0.18 ? 0.35 + (u / 0.18) * 0.65 : u > 0.82 ? 0.4 + ((1 - u) / 0.18) * 0.6 : 1;
    const yTaper = rShaft + (y - rShaft) * profileScale;
    const phi = angleRad + u * helicalTwistRad;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    pos.setXYZ(i, x, yTaper * c - z * s, yTaper * s + z * c);
  }
  vane.computeVertexNormals();
  return paintSubGeo(vane, hexColor);
}

function buildBroadheadBladeGeo(
  rShaft: number,
  rBlade: number,
  angleRad: number,
  hexColor: string
): THREE.BufferGeometry {
  const blade = new THREE.BoxGeometry(2.6, rBlade - rShaft * 0.5, 0.04, 4, 1, 1);
  const pos = blade.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = (x + 1.3) / 2.6; // 0 = rear barb, 1 = chisel nose
    const radial = (y + (rBlade - rShaft * 0.5) * 0.5) * (1 - u * 0.85) + rShaft * 0.5;
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    pos.setXYZ(i, 0.1 + u * 2.75, radial * c - z * s, radial * s + z * c);
  }
  blade.computeVertexNormals();
  return paintSubGeo(blade, hexColor);
}

/**
 * 8 & 9. 400gr Carbon Arrow (`arrow_400gr`) & Crossbow Bolt (`bolt_400gr`):
 * Woven carbon shaft + aluminum insert collar + 3 helical fletching vanes in `caseGeo`,
 * CNC 3-blade broadhead in `bulletGeo`, and notched nock collar in `livePrimerGeo`.
 */
function buildArcheryBundle(opts: {
  xHead: number;
  xFront: number;
  rShaft: number;
  rVaneOuter: number;
  vaneStart: number;
  vaneEnd: number;
  vaneColorPrimary: string;
  vaneColorCock: string;
  nockColor: string;
  broadheadLen: number;
  rBladeOuter: number;
}): CaliberGeometryBundle {
  const {
    xHead,
    xFront,
    rShaft,
    rVaneOuter,
    vaneStart,
    vaneEnd,
    vaneColorPrimary,
    vaneColorCock,
    nockColor,
    broadheadLen,
    rBladeOuter,
  } = opts;

  const collarX = xFront - 1.4;
  const shaftPts: THREE.Vector2[] = [
    new THREE.Vector2(0, xHead),
    new THREE.Vector2(rShaft * 0.92, xHead),
    new THREE.Vector2(rShaft, xHead + 0.25),
    new THREE.Vector2(rShaft, collarX),
    new THREE.Vector2(rShaft * 1.08, collarX + 0.08),
    new THREE.Vector2(rShaft * 1.08, xFront),
    new THREE.Vector2(0, xFront),
  ];
  const shaftGeo = paintSubGeo(finalizeLathe(shaftPts, 20), '#2b303a');

  const collarPts: THREE.Vector2[] = [
    new THREE.Vector2(rShaft * 1.09, collarX + 0.1),
    new THREE.Vector2(rShaft * 1.12, collarX + 0.15),
    new THREE.Vector2(rShaft * 1.12, xFront - 0.05),
    new THREE.Vector2(rShaft * 1.05, xFront),
  ];
  const insertGeo = paintSubGeo(finalizeLathe(collarPts, 20), '#cbd5e1');

  const vanes: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const ang = (k * Math.PI * 2) / 3;
    vanes.push(
      buildHelicalVaneGeo(
        vaneStart,
        vaneEnd,
        rShaft * 0.96,
        rVaneOuter,
        ang,
        0.28,
        k === 0 ? vaneColorCock : vaneColorPrimary
      )
    );
  }
  const caseParts = [shaftGeo, insertGeo, ...vanes];
  const caseGeo = mergeGeometries(caseParts, false);
  for (const p of caseParts) p.dispose();
  caseGeo.computeBoundingBox();
  caseGeo.computeBoundingSphere();

  // Machined 3-blade broadhead ferrule + chisel point (`bulletGeo`)
  const ferrulePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.4),
    new THREE.Vector2(rShaft * 0.88, -0.4),
    new THREE.Vector2(rShaft * 1.06, -0.2),
    new THREE.Vector2(rShaft * 1.04, 0.2),
    new THREE.Vector2(rShaft * 0.78, broadheadLen * 0.45),
    new THREE.Vector2(rShaft * 0.42, broadheadLen * 0.78),
    new THREE.Vector2(0.06, broadheadLen - 0.12),
    new THREE.Vector2(0, broadheadLen),
  ];
  const ferruleGeo = paintSubGeo(finalizeLathe(ferrulePts, 20), '#94a3b8');
  const blades: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    blades.push(
      buildBroadheadBladeGeo(
        rShaft,
        rBladeOuter,
        (k * Math.PI * 2) / 3,
        '#e2e8f0'
      )
    );
  }
  const bulletParts = [ferruleGeo, ...blades];
  const bulletGeo = mergeGeometries(bulletParts, false);
  for (const p of bulletParts) p.dispose();
  bulletGeo.computeBoundingBox();
  bulletGeo.computeBoundingSphere();

  // Rear aluminum / illuminated nock collar (`livePrimerGeo` & `spentPrimerGeo`)
  const nockPts: THREE.Vector2[] = [
    new THREE.Vector2(0, xHead - 0.55),
    new THREE.Vector2(rShaft * 0.72, xHead - 0.55),
    new THREE.Vector2(rShaft * 0.96, xHead - 0.32),
    new THREE.Vector2(rShaft * 0.98, xHead + 0.1),
    new THREE.Vector2(0, xHead + 0.1),
  ];
  const livePrimerGeo = paintSubGeo(finalizeLathe(nockPts, 18), nockColor);
  const spentPrimerGeo = livePrimerGeo.clone();

  const sootRingGeo = new THREE.RingGeometry(0.001, 0.002, 6);
  sootRingGeo.rotateY(-Math.PI / 2);
  sootRingGeo.translate(xHead, 0, 0);
  sootRingGeo.computeBoundingBox();
  sootRingGeo.computeBoundingSphere();
  const craterSootGeo = sootRingGeo.clone();

  return {
    caseGeo,
    bulletGeo,
    livePrimerGeo,
    spentPrimerGeo,
    sootRingGeo,
    craterSootGeo,
    xHead,
  };
}

/**
 * Builds 1:1 120mm / 125mm APFSDS tank cannon firing kinematics geometry:
 * - `caseGeo`: Drawn metallic aft stub base (retained after combustible propellant wall burns away)
 * - `bulletGeo`: Multi-tone DU/tungsten fin-stabilized long-rod penetrator dart + 3-petal sabot ring
 */
function buildTankApfsdsGeometries(
  caliber: '120mm_apfsds' | '125mm_apfsds'
): CaliberGeometryBundle {
  const is125 = caliber === '125mm_apfsds';
  const rRim = is125 ? 8.1 : 7.85;
  const rBody = is125 ? 7.45 : 7.25;
  const rLip = is125 ? 7.2 : 6.95;
  const stubLen = is125 ? 12.6 : 13.8;
  const xHead = -stubLen * 0.5;
  const xFront = stubLen * 0.5;
  const rPocket = 1.25;
  const pocketDepth = 0.85;

  // Metallic aft stub-base cup (brass/steel rim + chamfered extractor flange + hollow inner skirt)
  const stubPts: THREE.Vector2[] = [
    new THREE.Vector2(rPocket, xHead),
    new THREE.Vector2(rRim - 0.35, xHead),
    new THREE.Vector2(rRim, xHead + 0.35),
    new THREE.Vector2(rRim, xHead + 1.55),
    new THREE.Vector2(rBody, xHead + 2.05),
    new THREE.Vector2(rLip, xFront - 0.4),
    new THREE.Vector2(rLip - 0.28, xFront),
    new THREE.Vector2(rLip - 0.85, xFront),
    new THREE.Vector2(rLip - 0.95, xHead + 2.2),
    new THREE.Vector2(rPocket, xHead + 2.0),
    new THREE.Vector2(rPocket, xHead),
  ];
  const stubGeo = paintSubGeo(
    finalizeLathe(stubPts, 32),
    is125 ? '#b5914a' : '#8d96a3'
  );
  // Subtle forward scorched combustible-case collar ring
  const charPts: THREE.Vector2[] = [
    new THREE.Vector2(rLip - 0.32, xFront - 1.1),
    new THREE.Vector2(rLip + 0.05, xFront - 1.0),
    new THREE.Vector2(rLip + 0.02, xFront + 0.8),
    new THREE.Vector2(rLip - 0.38, xFront + 0.8),
    new THREE.Vector2(rLip - 0.32, xFront - 1.1),
  ];
  const charGeo = paintSubGeo(finalizeLathe(charPts, 28), '#44403c');
  const caseParts = [stubGeo, charGeo];
  const caseGeo = mergeGeometries(caseParts, false);
  for (const p of caseParts) p.dispose();
  caseGeo.computeBoundingBox();
  caseGeo.computeBoundingSphere();

  // 1:1 Fin-stabilized sub-caliber penetrator dart (L ~ 64 cm, Ø 2.4 cm DU/tungsten rod)
  const dartLen = is125 ? 64.0 : 62.0;
  const xTail = -dartLen * 0.48;
  const xNose = dartLen * 0.52;
  const rRod = 1.22;
  const rodPts: THREE.Vector2[] = [
    new THREE.Vector2(0, xTail),
    new THREE.Vector2(rRod * 0.82, xTail),
    new THREE.Vector2(rRod, xTail + 2.2),
    new THREE.Vector2(rRod, xNose - 12.0),
    new THREE.Vector2(rRod * 0.74, xNose - 6.0),
    new THREE.Vector2(rRod * 0.36, xNose - 2.2),
    new THREE.Vector2(0.14, xNose - 0.4),
    new THREE.Vector2(0, xNose),
  ];
  const rodGeo = paintSubGeo(
    finalizeLathe(rodPts, 22),
    is125 ? '#334155' : '#1e293b'
  );

  // Mid-body machined aluminum discarding-sabot drive collar (saddle + bourrelet)
  const rSabot = is125 ? 5.6 : 5.4;
  const sabotPts: THREE.Vector2[] = [
    new THREE.Vector2(rRod, -8.5),
    new THREE.Vector2(rSabot * 0.85, -7.2),
    new THREE.Vector2(rSabot, -5.2),
    new THREE.Vector2(rSabot, -2.4),
    new THREE.Vector2(rRod * 1.65, -0.5),
    new THREE.Vector2(rRod * 1.65, 4.2),
    new THREE.Vector2(rSabot, 5.8),
    new THREE.Vector2(rSabot, 8.2),
    new THREE.Vector2(rRod, 10.0),
  ];
  const sabotGeo = paintSubGeo(finalizeLathe(sabotPts, 24), '#cbd5e1');

  // Luminous magnesium-orange tracer base glow plug
  const tracerPts: THREE.Vector2[] = [
    new THREE.Vector2(0, xTail - 1.2),
    new THREE.Vector2(rRod * 0.72, xTail - 1.1),
    new THREE.Vector2(rRod * 0.82, xTail + 0.1),
    new THREE.Vector2(0, xTail + 0.1),
  ];
  const tracerGeo = paintSubGeo(finalizeLathe(tracerPts, 16), '#f97316');

  // 6 cruciform aerodynamic tail stabilizer fins
  const fins: THREE.BufferGeometry[] = [];
  const finSpan = is125 ? 5.2 : 4.9;
  for (let k = 0; k < 6; k++) {
    const fin = new THREE.BoxGeometry(10.5, finSpan - rRod, 0.24, 1, 1, 1);
    fin.translate(xTail + 6.0, rRod + (finSpan - rRod) * 0.48, 0);
    fin.rotateX((k * Math.PI) / 3);
    fins.push(paintSubGeo(fin, '#64748b'));
  }

  const bulletParts = [rodGeo, sabotGeo, tracerGeo, ...fins];
  const bulletGeo = mergeGeometries(bulletParts, false);
  for (const p of bulletParts) p.dispose();
  bulletGeo.computeBoundingBox();
  bulletGeo.computeBoundingSphere();

  const primers = buildBoxerPrimerGeometries({ xHead, rPocket, pocketDepth });
  return { caseGeo, bulletGeo, ...primers, xHead };
}

/**
 * Builds 1:1 WWII German 88×571mmR PzGr. 39 APCBC-HE artillery cartridge geometry:
 * - `caseGeo`: Full-length drawn rimmed brass casing (57.1 cm) ejected into canvas shell basket
 * - `bulletGeo`: Multi-tone 88mm hardened-steel APCBC shell with copper driving bands & white nose cap
 */
function build88mmPzgr39Geometries(): CaliberGeometryBundle {
  const xHead = -36.0;
  const xMouth = 21.1; // 57.1 cm brass case length
  const rRim = 5.65;
  const rBase = 5.05;
  const rShoulder = 4.78;
  const rNeck = 4.52;
  const rPocket = 1.1;
  const pocketDepth = 0.75;

  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(rPocket, xHead),
    new THREE.Vector2(rRim - 0.2, xHead),
    new THREE.Vector2(rRim, xHead + 0.25),
    new THREE.Vector2(rRim, xHead + 1.15),
    new THREE.Vector2(rBase, xHead + 1.55),
    new THREE.Vector2(rShoulder, xMouth - 9.5),
    new THREE.Vector2(rNeck, xMouth - 5.5),
    new THREE.Vector2(rNeck, xMouth),
    new THREE.Vector2(rNeck - 0.28, xMouth),
    new THREE.Vector2(rNeck - 0.34, xMouth - 6.0),
    new THREE.Vector2(rPocket, xHead + 2.4),
    new THREE.Vector2(rPocket, xHead),
  ];
  const caseGeo = paintSubGeo(finalizeLathe(casePts, 32), '#d8a62d');

  // 88mm PzGr. 39 APCBC-HE projectile (L = 33.6 cm, Ø 8.8 cm)
  const rShell = 4.4;
  const bodyPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -14.0),
    new THREE.Vector2(rShell * 0.88, -14.0),
    new THREE.Vector2(rShell, -12.2),
    new THREE.Vector2(rShell, 3.8),
    new THREE.Vector2(rShell * 0.84, 9.8),
    new THREE.Vector2(rShell * 0.56, 14.2),
    new THREE.Vector2(0, 14.2),
  ];
  const bodyGeo = paintSubGeo(finalizeLathe(bodyPts, 28), '#262b33');

  // Twin copper obturating driving bands
  const bandPtsA: THREE.Vector2[] = [
    new THREE.Vector2(rShell - 0.05, -10.8),
    new THREE.Vector2(rShell + 0.14, -10.6),
    new THREE.Vector2(rShell + 0.14, -8.8),
    new THREE.Vector2(rShell - 0.05, -8.6),
  ];
  const bandPtsB: THREE.Vector2[] = [
    new THREE.Vector2(rShell - 0.05, -7.8),
    new THREE.Vector2(rShell + 0.14, -7.6),
    new THREE.Vector2(rShell + 0.14, -5.8),
    new THREE.Vector2(rShell - 0.05, -5.6),
  ];
  const bandA = paintSubGeo(finalizeLathe(bandPtsA, 24), '#c8662d');
  const bandB = paintSubGeo(finalizeLathe(bandPtsB, 24), '#c8662d');

  // Aerodynamic ballistic windshield nose cone (painted white identification band)
  const capPts: THREE.Vector2[] = [
    new THREE.Vector2(0, 14.0),
    new THREE.Vector2(rShell * 0.56, 14.0),
    new THREE.Vector2(rShell * 0.34, 17.2),
    new THREE.Vector2(0.32, 19.3),
    new THREE.Vector2(0, 19.6),
  ];
  const capGeo = paintSubGeo(finalizeLathe(capPts, 24), '#e2e8f0');

  const bulletParts = [bodyGeo, bandA, bandB, capGeo];
  const bulletGeo = mergeGeometries(bulletParts, false);
  for (const p of bulletParts) p.dispose();
  bulletGeo.computeBoundingBox();
  bulletGeo.computeBoundingSphere();

  const primers = buildBoxerPrimerGeometries({ xHead, rPocket, pocketDepth });
  return { caseGeo, bulletGeo, ...primers, xHead };
}

/**
 * 7.92×57mm Mauser (CIP 8×57 IS: 57.0mm case, 82.0mm OAL, 19.13° shoulder, 198gr s.S. boat-tail)
 */
function build792MauserGeometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -1.42,
    rPocket: 0.148,
    pocketDepth: 0.095,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.325),
    new THREE.Vector2(0.148, -1.325),
    new THREE.Vector2(0.148, -1.408),
    new THREE.Vector2(0.162, -1.42),
    new THREE.Vector2(0.292, -1.42),
    new THREE.Vector2(0.31, -1.4),
    new THREE.Vector2(0.31, -1.33),
    new THREE.Vector2(0.258, -1.298),
    new THREE.Vector2(0.258, -1.21),
    new THREE.Vector2(0.308, -1.16),
    new THREE.Vector2(0.285, 0.78),
    new THREE.Vector2(0.214, 1.06),
    new THREE.Vector2(0.212, 1.42),
    new THREE.Vector2(0.194, 1.42),
    new THREE.Vector2(0.194, 1.02),
    new THREE.Vector2(0, 1.02),
  ];
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.44),
    new THREE.Vector2(0.155, -0.44),
    new THREE.Vector2(0.194, -0.32),
    new THREE.Vector2(0.194, 0.14),
    new THREE.Vector2(0.165, 0.44),
    new THREE.Vector2(0.108, 0.7),
    new THREE.Vector2(0.044, 0.88),
    new THREE.Vector2(0.014, 0.94),
    new THREE.Vector2(0, 0.95),
  ];
  return {
    caseGeo: finalizeLathe(casePts, 26),
    bulletGeo: finalizeLathe(bulletPts, 24),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}

/**
 * 1:1 USAF 30×173mm PGU-14/B API (GAU-8/A Avenger):
 * - `caseGeo`: 17.3 cm lightweight brushed aluminum alloy bottleneck case (Ø4.26 cm base)
 * - `bulletGeo`: Charcoal-black aluminum windshield, crimson incendiary band, & plastic/copper driving band (OAL 29.0 cm)
 */
function build30x173Gau8Geometries(): CaliberGeometryBundle {
  const xHead = -8.65;
  const xMouth = 8.65; // 17.3 cm aluminum case length
  const rRim = 2.13;
  const rBase = 2.11;
  const rShoulder = 1.98;
  const rNeck = 1.62;
  const rPocket = 0.48;
  const pocketDepth = 0.36;

  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(rPocket, xHead),
    new THREE.Vector2(rRim - 0.12, xHead),
    new THREE.Vector2(rRim, xHead + 0.15),
    new THREE.Vector2(rRim, xHead + 0.58),
    new THREE.Vector2(rRim - 0.24, xHead + 0.72),
    new THREE.Vector2(rRim - 0.24, xHead + 1.18),
    new THREE.Vector2(rBase, xHead + 1.42),
    new THREE.Vector2(rShoulder, xMouth - 3.6),
    new THREE.Vector2(rNeck, xMouth - 1.9),
    new THREE.Vector2(rNeck, xMouth),
    new THREE.Vector2(rNeck - 0.12, xMouth),
    new THREE.Vector2(rNeck - 0.14, xMouth - 2.1),
    new THREE.Vector2(rPocket, xHead + 1.6),
    new THREE.Vector2(rPocket, xHead),
  ];
  const caseGeo = paintSubGeo(finalizeLathe(casePts, 28), '#cbd5e1');

  // 30mm PGU-14/B API projectile (L = 14.5 cm, Ø 3.0 cm; bulletLocalOffset = 9.0 -> tip at +20.35)
  const rProj = 1.5;
  const bodyPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -3.1),
    new THREE.Vector2(rProj * 0.9, -3.1),
    new THREE.Vector2(rProj, -2.4),
    new THREE.Vector2(rProj, 2.2),
    new THREE.Vector2(rProj * 0.84, 5.6),
    new THREE.Vector2(rProj * 0.48, 8.9),
    new THREE.Vector2(0.18, 11.15),
    new THREE.Vector2(0, 11.35),
  ];
  const bodyGeo = paintSubGeo(finalizeLathe(bodyPts, 24), '#1f2937');

  // Driving band (copper-bronze obturation band)
  const bandPts: THREE.Vector2[] = [
    new THREE.Vector2(rProj - 0.03, -1.6),
    new THREE.Vector2(rProj + 0.08, -1.5),
    new THREE.Vector2(rProj + 0.08, -0.2),
    new THREE.Vector2(rProj - 0.03, -0.1),
  ];
  const bandGeo = paintSubGeo(finalizeLathe(bandPts, 22), '#c8662d');

  // Signature USAF crimson incendiary identification band
  const redBandPts: THREE.Vector2[] = [
    new THREE.Vector2(rProj - 0.02, 2.1),
    new THREE.Vector2(rProj * 0.97, 2.2),
    new THREE.Vector2(rProj * 0.9, 3.6),
    new THREE.Vector2(rProj * 0.88, 3.7),
  ];
  const redBandGeo = paintSubGeo(finalizeLathe(redBandPts, 22), '#dc2626');

  const bulletParts = [bodyGeo, bandGeo, redBandGeo];
  const bulletGeo = mergeGeometries(bulletParts, false);
  for (const p of bulletParts) p.dispose();
  bulletGeo.computeBoundingBox();
  bulletGeo.computeBoundingSphere();

  const primers = buildBoxerPrimerGeometries({ xHead, rPocket, pocketDepth });
  return { caseGeo, bulletGeo, ...primers, xHead };
}

export interface CaliberVisualSpec {
  caseColor: string;
  reserveCaseColor: string;
  bulletColor: string;
  primerColor: string;
  bulletLocalOffset: number;
  reserveTiltZ: number;
  flashScaleMult: number;
  streakThickness: number;
}

export const CALIBER_VISUAL_SPECS: Record<CaliberProfile, CaliberVisualSpec> = {
  '9mm_para': {
    caseColor: '#e5b318',
    reserveCaseColor: '#c7920e',
    bulletColor: '#c2511a',
    primerColor: '#e2e8f0',
    bulletLocalOffset: 1.33,
    reserveTiltZ: 0.12,
    flashScaleMult: 0.95,
    streakThickness: 0.18,
  },
  '45_acp': {
    caseColor: '#e2b12b',
    reserveCaseColor: '#c2921c',
    bulletColor: '#c4521c',
    primerColor: '#f1f5f9',
    bulletLocalOffset: 1.36,
    reserveTiltZ: 0.16,
    flashScaleMult: 1.08,
    streakThickness: 0.24,
  },
  '762_m43': {
    caseColor: '#b98d3b',
    reserveCaseColor: '#96702d',
    bulletColor: '#bd4c19',
    primerColor: '#cbd5e1',
    bulletLocalOffset: 1.85,
    reserveTiltZ: 0.16,
    flashScaleMult: 1.12,
    streakThickness: 0.2,
  },
  '556_nato': {
    caseColor: '#daa724',
    reserveCaseColor: '#b68918',
    bulletColor: '#c04e18',
    primerColor: '#e2e8f0',
    bulletLocalOffset: 1.98,
    reserveTiltZ: 0.1,
    flashScaleMult: 1.12,
    streakThickness: 0.17,
  },
  '57_28': {
    caseColor: '#d9ae38',
    reserveCaseColor: '#b58d24',
    bulletColor: '#b8501c',
    primerColor: '#e2e8f0',
    bulletLocalOffset: 1.48,
    reserveTiltZ: 0,
    flashScaleMult: 0.98,
    streakThickness: 0.15,
  },
  '338_lapua': {
    caseColor: '#deb23d',
    reserveCaseColor: '#b88f28',
    bulletColor: '#b85314',
    primerColor: '#e2e8f0',
    bulletLocalOffset: 2.75,
    reserveTiltZ: 0.05,
    flashScaleMult: 1.5,
    streakThickness: 0.25,
  },
  '50_bmg': {
    caseColor: '#d2a334',
    reserveCaseColor: '#aa8023',
    bulletColor: '#bb4414',
    primerColor: '#cbd5e1',
    bulletLocalOffset: 3.45,
    reserveTiltZ: 0.04,
    flashScaleMult: 1.88,
    streakThickness: 0.34,
  },
  '50_ae': {
    caseColor: '#e6c258',
    reserveCaseColor: '#c49e38',
    bulletColor: '#c4511a',
    primerColor: '#f1f5f9',
    bulletLocalOffset: 1.58,
    reserveTiltZ: 0.1,
    flashScaleMult: 1.44,
    streakThickness: 0.28,
  },
  arrow_400gr: {
    caseColor: '#2b303a',
    reserveCaseColor: '#1f242c',
    bulletColor: '#cbd5e1',
    primerColor: '#f97316',
    bulletLocalOffset: 33.0,
    reserveTiltZ: 0,
    flashScaleMult: 0,
    streakThickness: 0.09,
  },
  bolt_400gr: {
    caseColor: '#272c36',
    reserveCaseColor: '#1d222a',
    bulletColor: '#e2e8f0',
    primerColor: '#eab308',
    bulletLocalOffset: 23.2,
    reserveTiltZ: 0,
    flashScaleMult: 0,
    streakThickness: 0.1,
  },
  '357_magnum': {
    caseColor: '#e6b938',
    reserveCaseColor: '#c79a22',
    bulletColor: '#c2511a',
    primerColor: '#f1f5f9',
    bulletLocalOffset: 1.18,
    reserveTiltZ: 0,
    flashScaleMult: 1.28,
    streakThickness: 0.21,
  },
  '12_gauge': {
    caseColor: '#b91c1c',
    reserveCaseColor: '#991b1b',
    bulletColor: '#cbd5e1',
    primerColor: '#e6b83a',
    bulletLocalOffset: 0.52,
    reserveTiltZ: 0,
    flashScaleMult: 1.52,
    streakThickness: 0.36,
  },
  '30_30_win': {
    caseColor: '#dfae2b',
    reserveCaseColor: '#b7891e',
    bulletColor: '#bd4c19',
    primerColor: '#e2e8f0',
    bulletLocalOffset: 1.24,
    reserveTiltZ: 0,
    flashScaleMult: 1.3,
    streakThickness: 0.2,
  },
  '30_06': {
    caseColor: '#dca92c',
    reserveCaseColor: '#b7891e',
    bulletColor: '#bd4c19',
    primerColor: '#e2e8f0',
    bulletLocalOffset: 1.52,
    reserveTiltZ: 0.06,
    flashScaleMult: 1.38,
    streakThickness: 0.22,
  },
  '473_caseless': {
    caseColor: '#a68252',
    reserveCaseColor: '#8d6c40',
    bulletColor: '#c95c22',
    primerColor: '#d97706',
    bulletLocalOffset: 1.48,
    reserveTiltZ: 0,
    flashScaleMult: 1.05,
    streakThickness: 0.15,
  },
  '9x39_subsonic': {
    caseColor: '#5c6654',
    reserveCaseColor: '#4a5343',
    bulletColor: '#b94e1b',
    primerColor: '#cbd5e1',
    bulletLocalOffset: 1.88,
    reserveTiltZ: 0.12,
    flashScaleMult: 0.42,
    streakThickness: 0.22,
  },
  '545_m74': {
    caseColor: '#69725e',
    reserveCaseColor: '#555d4c',
    bulletColor: '#bc4d19',
    primerColor: '#cbd5e1',
    bulletLocalOffset: 1.9,
    reserveTiltZ: 0.15,
    flashScaleMult: 1.08,
    streakThickness: 0.16,
  },
  '762_nato': {
    caseColor: '#dfae2b',
    reserveCaseColor: '#bb8e1e',
    bulletColor: '#c04f19',
    primerColor: '#e2e8f0',
    bulletLocalOffset: 2.28,
    reserveTiltZ: 0,
    flashScaleMult: 1.42,
    streakThickness: 0.23,
  },
  '125mm_apfsds': {
    caseColor: '#b5914a',
    reserveCaseColor: '#8d6e35',
    bulletColor: '#334155',
    primerColor: '#e2e8f0',
    bulletLocalOffset: 16.0,
    reserveTiltZ: 0,
    flashScaleMult: 7.4,
    streakThickness: 2.8,
  },
  '120mm_apfsds': {
    caseColor: '#8d96a3',
    reserveCaseColor: '#64748b',
    bulletColor: '#1e293b',
    primerColor: '#e2e8f0',
    bulletLocalOffset: 16.0,
    reserveTiltZ: 0,
    flashScaleMult: 8.6,
    streakThickness: 2.6,
  },
  '88mm_pzgr39': {
    caseColor: '#d8a62d',
    reserveCaseColor: '#b2851f',
    bulletColor: '#262b33',
    primerColor: '#e2e8f0',
    bulletLocalOffset: 26.0,
    reserveTiltZ: 0,
    flashScaleMult: 10.2,
    streakThickness: 3.4,
  },
  '792_mauser': {
    caseColor: '#dca82d',
    reserveCaseColor: '#b5871f',
    bulletColor: '#bd4c19',
    primerColor: '#e2e8f0',
    bulletLocalOffset: 1.48,
    reserveTiltZ: 0.05,
    flashScaleMult: 1.44,
    streakThickness: 0.23,
  },
  '30x173_gau8': {
    caseColor: '#cbd5e1',
    reserveCaseColor: '#94a3b8',
    bulletColor: '#1f2937',
    primerColor: '#e2e8f0',
    bulletLocalOffset: 9.0,
    reserveTiltZ: 0,
    flashScaleMult: 5.6,
    streakThickness: 1.65,
  },
};

export interface WeaponRoundFitSpec {
  roundScale: number;
  magLocalShiftX: number;
  ignitionF: number;
}

/**
 * Static zero-allocation per-weapon fit & primer-strike timing lookup table.
 * Verified against every weapon's magazine cavity, feed lips, chamber, and ejection port!
 */
export const WEAPON_ROUND_FIT: Record<WeaponId, WeaponRoundFitSpec> = {
  g17: { roundScale: 0.96, magLocalShiftX: -0.44, ignitionF: 0.09 },
  p320: { roundScale: 0.95, magLocalShiftX: -0.44, ignitionF: 0.09 },
  mp5: { roundScale: 0.54, magLocalShiftX: -0.32, ignitionF: 0.1 },
  ak15: { roundScale: 0.68, magLocalShiftX: -0.49, ignitionF: 0.1 },
  m4a1: { roundScale: 0.62, magLocalShiftX: -0.35, ignitionF: 0.1 },
  scar: { roundScale: 0.62, magLocalShiftX: -0.35, ignitionF: 0.1 },
  aug: { roundScale: 0.58, magLocalShiftX: -0.35, ignitionF: 0.1 },
  awm: { roundScale: 1.0, magLocalShiftX: 0.42, ignitionF: 0.11 },
  m82a1: { roundScale: 0.68, magLocalShiftX: -0.89, ignitionF: 0.14 },
  deagle: { roundScale: 1.0, magLocalShiftX: -0.05, ignitionF: 0.1 },
  p90: { roundScale: 0.68, magLocalShiftX: -0.385, ignitionF: 0.18 },
  lift33: { roundScale: 0.68, magLocalShiftX: 0, ignitionF: 0.32 },
  r500: { roundScale: 1.0, magLocalShiftX: 0, ignitionF: 0.32 },
  python: { roundScale: 0.88, magLocalShiftX: -0.47, ignitionF: 0.2 },
  benellim4: { roundScale: 0.44, magLocalShiftX: -0.11, ignitionF: 0.12 },
  garand: { roundScale: 0.8, magLocalShiftX: -0.515, ignitionF: 0.1 },
  m249: { roundScale: 0.96, magLocalShiftX: -0.35, ignitionF: 0.22 },
  p08: { roundScale: 0.76, magLocalShiftX: -0.34, ignitionF: 0.12 },
  vector: { roundScale: 0.86, magLocalShiftX: -0.39, ignitionF: 0.11 },
  g11: { roundScale: 0.78, magLocalShiftX: -0.06, ignitionF: 0.11 },
  vss: { roundScale: 1.0, magLocalShiftX: -0.22, ignitionF: 0.105 },
  m134: { roundScale: 1.0, magLocalShiftX: -0.45, ignitionF: 0.09 },
  an94: { roundScale: 0.92, magLocalShiftX: -0.35, ignitionF: 0.105 },
  ztz99a: { roundScale: 1.0, magLocalShiftX: 0, ignitionF: 0.11 },
  m1a2: { roundScale: 1.0, magLocalShiftX: 0, ignitionF: 0.08 },
  leopard2a7: { roundScale: 1.0, magLocalShiftX: 0, ignitionF: 0.08 },
  tiger1: { roundScale: 1.0, magLocalShiftX: 0, ignitionF: 0.11 },
  winchester1894: { roundScale: 0.88, magLocalShiftX: 0, ignitionF: 0.12 },
  rem870: { roundScale: 0.44, magLocalShiftX: -0.11, ignitionF: 0.11 },
  m1911: { roundScale: 0.96, magLocalShiftX: -0.32, ignitionF: 0.16 },
  mg42: { roundScale: 1.25, magLocalShiftX: -0.32, ignitionF: 0.22 },
  k98k: { roundScale: 1.25, magLocalShiftX: -0.3, ignitionF: 0.14 },
  thompson: { roundScale: 0.92, magLocalShiftX: -0.34, ignitionF: 0.22 },
  gau8: { roundScale: 1.0, magLocalShiftX: 0, ignitionF: 0.09 },
};

const caliberGeoCache = new Map<CaliberProfile, CaliberGeometryBundle>();

export function getCaliberGeometries(
  profile: CaliberProfile
): CaliberGeometryBundle {
  const cached = caliberGeoCache.get(profile);
  if (cached) return cached;

  let built: CaliberGeometryBundle;
  switch (profile) {
    case '762_m43':
      built = build762Geometries();
      break;
    case '556_nato':
      built = build556Geometries();
      break;
    case '57_28':
      built = build57x28Geometries();
      break;
    case '338_lapua':
      built = build338LapuaGeometries();
      break;
    case '50_bmg':
      built = build50BmgGeometries();
      break;
    case '50_ae':
      built = build50AeGeometries();
      break;
    case '357_magnum':
      built = build357MagnumGeometries();
      break;
    case '12_gauge':
      built = build12GaugeGeometries();
      break;
    case '30_30_win':
      built = build3030WinGeometries();
      break;
    case '30_06':
      built = build3006Geometries();
      break;
    case '45_acp':
      built = build45AcpGeometries();
      break;
    case '473_caseless':
      built = build473CaselessGeometries();
      break;
    case '9x39_subsonic':
      built = build9x39Geometries();
      break;
    case '545_m74':
      built = build545M74Geometries();
      break;
    case '762_nato':
      built = build762NatoGeometries();
      break;
    case '125mm_apfsds':
      built = buildTankApfsdsGeometries('125mm_apfsds');
      break;
    case '120mm_apfsds':
      built = buildTankApfsdsGeometries('120mm_apfsds');
      break;
    case '88mm_pzgr39':
      built = build88mmPzgr39Geometries();
      break;
    case '792_mauser':
      built = build792MauserGeometries();
      break;
    case '30x173_gau8':
      built = build30x173Gau8Geometries();
      break;
    case 'arrow_400gr':
      built = buildArcheryBundle({
        xHead: -34.0,
        xFront: 33.0,
        rShaft: 0.33,
        rVaneOuter: 0.68,
        vaneStart: -32.2,
        vaneEnd: -26.5,
        vaneColorPrimary: '#ea580c',
        vaneColorCock: '#f8fafc',
        nockColor: '#fb923c',
        broadheadLen: 3.8,
        rBladeOuter: 0.62,
      });
      break;
    case 'bolt_400gr':
      built = buildArcheryBundle({
        xHead: -24.0,
        xFront: 23.2,
        rShaft: 0.36,
        rVaneOuter: 0.68,
        vaneStart: -22.6,
        vaneEnd: -17.4,
        vaneColorPrimary: '#dc2626',
        vaneColorCock: '#fde047',
        nockColor: '#eab308',
        broadheadLen: 3.6,
        rBladeOuter: 0.6,
      });
      break;
    case '9mm_para':
    default:
      built = build9mmGeometries();
      break;
  }

  caliberGeoCache.set(profile, built);
  return built;
}

/**
 * Pure scalar helper tracking M82A1 short-recoil muzzle brake shift (`barrelDx`)
 * with zero heap allocations inside `useFrame`.
 */
function computeMuzzleRecoilShiftX(weaponId: WeaponId, f: number): number {
  if (weaponId === 'ztz99a') {
    const up =
      f <= 0.16 ? 0 : f >= 0.33 ? 1 : ((f - 0.16) / 0.17) ** 2 * (3 - 2 * ((f - 0.16) / 0.17));
    const dn =
      f <= 0.34 ? 0 : f >= 0.48 ? 1 : ((f - 0.34) / 0.14) ** 2 * (3 - 2 * ((f - 0.34) / 0.14));
    return -32.0 * Math.max(0, up - dn);
  }
  if (weaponId === 'm1a2') {
    const up =
      f <= 0.2 ? 0 : f >= 0.34 ? 1 : ((f - 0.2) / 0.14) ** 2 * (3 - 2 * ((f - 0.2) / 0.14));
    const dn =
      f <= 0.36 ? 0 : f >= 0.46 ? 1 : ((f - 0.36) / 0.1) ** 2 * (3 - 2 * ((f - 0.36) / 0.1));
    return -30.0 * Math.max(0, up - dn);
  }
  if (weaponId === 'leopard2a7') {
    const up =
      f <= 0.14 ? 0 : f >= 0.32 ? 1 : ((f - 0.14) / 0.18) ** 2 * (3 - 2 * ((f - 0.14) / 0.18));
    const dn =
      f <= 0.32 ? 0 : f >= 0.48 ? 1 : ((f - 0.32) / 0.16) ** 2 * (3 - 2 * ((f - 0.32) / 0.16));
    return -34.0 * Math.max(0, up - dn);
  }
  if (weaponId === 'tiger1') {
    const up =
      f <= 0.22 ? 0 : f >= 0.4 ? 1 : ((f - 0.22) / 0.18) ** 2 * (3 - 2 * ((f - 0.22) / 0.18));
    const dn =
      f <= 0.42 ? 0 : f >= 0.56 ? 1 : ((f - 0.42) / 0.14) ** 2 * (3 - 2 * ((f - 0.42) / 0.14));
    return -29.0 * Math.max(0, up - dn);
  }
  if (weaponId === 'g11') {
    const segUp =
      f <= 0.2 ? 0 : f >= 0.38 ? 1 : ((f - 0.2) / 0.18) ** 2 * (3 - 2 * ((f - 0.2) / 0.18));
    const segDn =
      f <= 0.74 ? 0 : f >= 0.9 ? 1 : ((f - 0.74) / 0.16) ** 2 * (3 - 2 * ((f - 0.74) / 0.16));
    return -4.2 * Math.max(0, segUp - segDn);
  }
  if (weaponId === 'an94') {
    const segUp =
      f <= 0.11 ? 0 : f >= 0.42 ? 1 : ((f - 0.11) / 0.31) ** 2 * (3 - 2 * ((f - 0.11) / 0.31));
    const segDn =
      f <= 0.68 ? 0 : f >= 0.88 ? 1 : ((f - 0.68) / 0.2) ** 2 * (3 - 2 * ((f - 0.68) / 0.2));
    return -4.2 * Math.max(0, segUp - segDn);
  }
  if (weaponId === 'p08') {
    if (f < 0.125 || f >= 0.88) return 0;
    if (f < 0.205) {
      const t = Math.min(1, Math.max(0, (f - 0.125) / 0.08));
      return -0.65 * (t * t * (3 - 2 * t));
    }
    if (f < 0.76) return -0.65;
    const t = Math.min(1, Math.max(0, (f - 0.76) / 0.12));
    return -0.65 * (1 - t * t * (3 - 2 * t));
  }
  if (weaponId !== 'm82a1') return 0;
  if (f < 0.16 || f >= 0.57) return 0;
  if (f < 0.3) {
    const u = Math.min(1, Math.max(0, (f - 0.16) / 0.14));
    return -2.4 * Math.sin(u * (Math.PI * 0.5));
  }
  if (f < 0.35) {
    const t = Math.min(1, Math.max(0, (f - 0.3) / 0.05));
    return -2.4 + 0.1 * (t * t * (3 - 2 * t));
  }
  const t = Math.min(1, Math.max(0, (f - 0.35) / 0.22));
  return -2.3 * (1 - t * t * (3 - 2 * t));
}


// ============================================================================
// Physics bridge: quantitative ballistics + rigid-body brass + smoke wisps
// ============================================================================

/** Takedown-mat neoprene thickness above `workbenchMeta.gridY` (cm) */
const MAT_SURFACE_OFFSET = 0.45;
const MAT_HALF_X = 55;
const MAT_HALF_Z = 26;

const CALIBER_CASE_COLORS: Record<CaliberProfile, THREE.Color> = {
  '9mm_para': new THREE.Color(CALIBER_VISUAL_SPECS['9mm_para'].caseColor),
  '45_acp': new THREE.Color(CALIBER_VISUAL_SPECS['45_acp'].caseColor),
  '762_m43': new THREE.Color(CALIBER_VISUAL_SPECS['762_m43'].caseColor),
  '556_nato': new THREE.Color(CALIBER_VISUAL_SPECS['556_nato'].caseColor),
  '57_28': new THREE.Color(CALIBER_VISUAL_SPECS['57_28'].caseColor),
  '338_lapua': new THREE.Color(CALIBER_VISUAL_SPECS['338_lapua'].caseColor),
  '50_bmg': new THREE.Color(CALIBER_VISUAL_SPECS['50_bmg'].caseColor),
  '50_ae': new THREE.Color(CALIBER_VISUAL_SPECS['50_ae'].caseColor),
  arrow_400gr: new THREE.Color(CALIBER_VISUAL_SPECS.arrow_400gr.caseColor),
  bolt_400gr: new THREE.Color(CALIBER_VISUAL_SPECS.bolt_400gr.caseColor),
  '357_magnum': new THREE.Color(CALIBER_VISUAL_SPECS['357_magnum'].caseColor),
  '12_gauge': new THREE.Color(CALIBER_VISUAL_SPECS['12_gauge'].caseColor),
  '30_30_win': new THREE.Color(CALIBER_VISUAL_SPECS['30_30_win'].caseColor),
  '30_06': new THREE.Color(CALIBER_VISUAL_SPECS['30_06'].caseColor),
  '473_caseless': new THREE.Color(CALIBER_VISUAL_SPECS['473_caseless'].caseColor),
  '9x39_subsonic': new THREE.Color(CALIBER_VISUAL_SPECS['9x39_subsonic'].caseColor),
  '545_m74': new THREE.Color(CALIBER_VISUAL_SPECS['545_m74'].caseColor),
  '762_nato': new THREE.Color(CALIBER_VISUAL_SPECS['762_nato'].caseColor),
  '125mm_apfsds': new THREE.Color(CALIBER_VISUAL_SPECS['125mm_apfsds'].caseColor),
  '120mm_apfsds': new THREE.Color(CALIBER_VISUAL_SPECS['120mm_apfsds'].caseColor),
  '88mm_pzgr39': new THREE.Color(CALIBER_VISUAL_SPECS['88mm_pzgr39'].caseColor),
  '792_mauser': new THREE.Color(CALIBER_VISUAL_SPECS['792_mauser'].caseColor),
  '30x173_gau8': new THREE.Color(CALIBER_VISUAL_SPECS['30x173_gau8'].caseColor),
};

interface EjectionSpawnSpec {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
  hasVent: boolean;
  vx: number;
  vy: number;
  vz: number;
}

const ejectionSpawnCache = new Map<WeaponId, EjectionSpawnSpec>();

/**
 * Samples each plugin's own kinematics ONCE at the ejection instant so the
 * rigid-body brass takes over exactly where the scripted extraction ends.
 */
function getEjectionSpawnSpec(
  weaponId: WeaponId,
  plugin: NonNullable<ReturnType<typeof getLoadedWeaponPlugin>>
): EjectionSpawnSpec {
  const cached = ejectionSpawnCache.get(weaponId);
  if (cached) return cached;
  const timing = getWeaponFiringTiming(weaponId);
  const atEject = plugin.computeBallisticsState(timing.ejectF);
  const caliber = getWeaponManifest(weaponId).caliberProfile;
  const gasF =
    computeGasPortUncoverF(caliber, timing) ?? timing.muzzleExitF + 0.02;
  const atGas = plugin.computeBallisticsState(Math.max(gasF, timing.muzzleExitF));
  const spec: EjectionSpawnSpec = {
    px: atEject.spentCasePos[0],
    py: atEject.spentCasePos[1],
    pz: atEject.spentCasePos[2],
    rx: atEject.spentCaseRot[0],
    ry: atEject.spentCaseRot[1],
    rz: atEject.spentCaseRot[2],
    hasVent: timing.gasPortTravel !== null,
    vx: atGas.gasPortPos[0],
    vy: atGas.gasPortPos[1],
    vz: atGas.gasPortPos[2],
  };
  if (weaponId === 'm4a1') {
    // Stoner bolt-carrier exhaust vents blow out the right-side ejection port
    spec.vx = spec.px + 0.9;
    spec.vy = spec.py + 0.35;
    spec.vz = spec.pz + 0.45;
  }
  ejectionSpawnCache.set(weaponId, spec);
  return spec;
}

const _physicsInput = createArmoryPhysicsInput();
const _ballisticsSample = createInternalBallisticsSample();

// ============================================================================
// Muzzle-device gas dynamics specs (data-driven brake jets & flash-hider prongs)
// ============================================================================

interface MuzzleJetSpec {
  /** Port offset along the bore from `muzzlePos` (cm, negative = rearward) */
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  /** Jet axis direction (normalized at build time) */
  dir: [number, number, number];
  length: number;
  radius: number;
  /** 0 = hot core jet, 1 = outer turbulent sheath */
  layer: 0 | 1;
  intensity: number;
}

interface MuzzleDeviceSpec {
  kind: 'brake' | 'flash_hider' | 'bare';
  /** Forward-plume damping (brakes divert gas laterally) */
  forwardDamp: number;
  jets: MuzzleJetSpec[];
}

const DEG35 = (35 * Math.PI) / 180;

/** Rearward-lateral ±35° brake jets on both flanks. */
function lateralBrakeJets(
  offsets: readonly number[],
  length: number,
  radius: number,
  sideOffsetZ: number
): MuzzleJetSpec[] {
  const jets: MuzzleJetSpec[] = [];
  for (let i = 0; i < offsets.length; i++) {
    const falloff = 1 - i * 0.22;
    for (const side of [1, -1] as const) {
      const dir: [number, number, number] = [
        -Math.sin(DEG35),
        0.04,
        side * Math.cos(DEG35),
      ];
      jets.push({
        offsetX: offsets[i],
        offsetY: 0,
        offsetZ: side * sideOffsetZ,
        dir,
        length: length * falloff,
        radius: radius * falloff,
        layer: 1,
        intensity: 0.7 * falloff,
      });
      jets.push({
        offsetX: offsets[i],
        offsetY: 0,
        offsetZ: side * sideOffsetZ,
        dir,
        length: length * 0.58 * falloff,
        radius: radius * 0.42 * falloff,
        layer: 0,
        intensity: 0.95 * falloff,
      });
    }
  }
  return jets;
}

/** Forward-slanted radial flash-hider prong / birdcage slot jets. */
function radialProngJets(
  anglesDeg: readonly number[],
  length: number,
  radius: number
): MuzzleJetSpec[] {
  const jets: MuzzleJetSpec[] = [];
  for (let i = 0; i < anglesDeg.length; i++) {
    const a = (anglesDeg[i] * Math.PI) / 180;
    const cy = Math.cos(a);
    const sz = Math.sin(a);
    jets.push({
      offsetX: -0.35,
      offsetY: cy * 0.32,
      offsetZ: sz * 0.32,
      dir: [0.55, cy, sz],
      length,
      radius,
      layer: 1,
      intensity: 0.55,
    });
    jets.push({
      offsetX: -0.35,
      offsetY: cy * 0.32,
      offsetZ: sz * 0.32,
      dir: [0.55, cy, sz],
      length: length * 0.55,
      radius: radius * 0.38,
      layer: 0,
      intensity: 0.85,
    });
  }
  return jets;
}

const MUZZLE_DEVICE_SPECS: Record<WeaponId, MuzzleDeviceSpec> = {
  // Barrett 2-chamber arrowhead brake (~65% recoil reduction)
  m82a1: {
    kind: 'brake',
    forwardDamp: 0.62,
    jets: lateralBrakeJets([-0.95, -0.28], 5.2, 1.25, 0.44),
  },
  // AI AWM 2-chamber tactical brake
  awm: {
    kind: 'brake',
    forwardDamp: 0.72,
    jets: lateralBrakeJets([-0.55, -0.14], 3.1, 0.72, 0.26),
  },
  // AK-15 slotted brake + asymmetric up-right anti-climb compensator port
  ak15: {
    kind: 'brake',
    forwardDamp: 0.82,
    jets: [
      ...lateralBrakeJets([-0.48], 2.4, 0.56, 0.22),
      {
        offsetX: -0.82,
        offsetY: 0.2,
        offsetZ: 0.12,
        dir: [-0.15, 0.92, 0.36],
        length: 1.6,
        radius: 0.36,
        layer: 1,
        intensity: 0.6,
      },
    ],
  },
  // A2 birdcage: top & side slots, closed bottom (anti-dust signature)
  m4a1: {
    kind: 'flash_hider',
    forwardDamp: 0.9,
    jets: radialProngJets([0, 60, 120, -60, -120], 1.35, 0.3),
  },
  scar: {
    kind: 'flash_hider',
    forwardDamp: 0.9,
    jets: radialProngJets([0, 120, -120], 1.35, 0.32),
  },
  aug: {
    kind: 'flash_hider',
    forwardDamp: 0.9,
    jets: radialProngJets([60, 180, -60], 1.25, 0.3),
  },
  p90: {
    kind: 'flash_hider',
    forwardDamp: 0.9,
    jets: radialProngJets([45, 135, -45, -135], 1.0, 0.24),
  },
  g17: { kind: 'bare', forwardDamp: 1, jets: [] },
  p320: { kind: 'bare', forwardDamp: 1, jets: [] },
  deagle: { kind: 'bare', forwardDamp: 1, jets: [] },
  mp5: { kind: 'bare', forwardDamp: 1, jets: [] },
  lift33: { kind: 'bare', forwardDamp: 1, jets: [] },
  r500: { kind: 'bare', forwardDamp: 1, jets: [] },
  // Colt Python 6": bare target crown + radial forcing-cone cylinder-gap flash jets at X = 2.20
  python: {
    kind: 'bare',
    forwardDamp: 0.95,
    jets: [0, 90, 180, -90].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return {
        offsetX: -15.22,
        offsetY: Math.cos(a) * 0.24,
        offsetZ: Math.sin(a) * 0.24,
        dir: [0.08, Math.cos(a), Math.sin(a)] as [number, number, number],
        length: 1.05,
        radius: 0.28,
        layer: 1 as const,
        intensity: 0.72,
      };
    }),
  },
  // Benelli M4 18.5" smoothbore w/ Modified cylinder choke
  benellim4: { kind: 'bare', forwardDamp: 1, jets: [] },
  // M1 Garand 24" Springfield bare crown
  garand: { kind: 'bare', forwardDamp: 1, jets: [] },
  // FN M249 SAW 18.3" barrel w/ NATO birdcage flash suppressor
  m249: {
    kind: 'flash_hider',
    forwardDamp: 0.9,
    jets: radialProngJets([0, 60, 120, -60, -120], 1.4, 0.32),
  },
  // DWM Luger P08 4" tapered bare crown
  p08: { kind: 'bare', forwardDamp: 1, jets: [] },
  // KRISS Vector 5.5" M16x1 LH 4-slot flash suppressor
  vector: {
    kind: 'flash_hider',
    forwardDamp: 0.92,
    jets: radialProngJets([0, 90, 180, -90], 1.15, 0.28),
  },
  // H&K G11 K2 540mm floating barrel w/ 6-slot radial flash suppressor
  g11: {
    kind: 'flash_hider',
    forwardDamp: 0.88,
    jets: radialProngJets([0, 60, 120, 180, -120, -60], 1.15, 0.24),
  },
  // VSS Vintorez integral 5-baffle subsonic suppressor (heavily damped muzzle signature!)
  vss: {
    kind: 'bare',
    forwardDamp: 0.28,
    jets: [],
  },
  // GE M134D Minigun 6-barrel rotary cluster w/ 6-tube flash suppressor
  m134: {
    kind: 'flash_hider',
    forwardDamp: 0.94,
    jets: radialProngJets([0, 60, 120, 180, -120, -60], 1.75, 0.36),
  },
  // Nikonov AN-94 iconic figure-8 whistling dual-chamber muzzle brake
  an94: {
    kind: 'brake',
    forwardDamp: 0.78,
    jets: [
      ...lateralBrakeJets([-0.42], 2.1, 0.48, 0.24),
      {
        offsetX: -0.25,
        offsetY: 0.22,
        offsetZ: 0,
        dir: [0.15, 0.95, 0],
        length: 1.45,
        radius: 0.32,
        layer: 1,
        intensity: 0.58,
      },
      {
        offsetX: -0.25,
        offsetY: -0.22,
        offsetZ: 0,
        dir: [0.15, -0.95, 0],
        length: 1.45,
        radius: 0.32,
        layer: 1,
        intensity: 0.58,
      },
    ],
  },
  // PLA ZTZ-99A 125mm ZPT-98 L/50 smoothbore bare muzzle + thermal reference mirror
  ztz99a: { kind: 'bare', forwardDamp: 1, jets: [] },
  // M1A2 SEP v3 Abrams 120mm M256 L/44 smoothbore bare muzzle
  m1a2: { kind: 'bare', forwardDamp: 1, jets: [] },
  // KMW Leopard 2A7V 120mm Rh-120 L/55A1 smoothbore bare muzzle
  leopard2a7: { kind: 'bare', forwardDamp: 1, jets: [] },
  // WWII Pz.Kpfw. VI Tiger 131 88mm KwK 36 L/56 iconic twin-baffle lateral muzzle brake
  tiger1: {
    kind: 'brake',
    forwardDamp: 0.65,
    jets: lateralBrakeJets([-0.85, -0.32], 3.4, 0.85, 0.32),
  },
  // Winchester Model 1894 20" .30-30 WCF bare carbine crown
  winchester1894: { kind: 'bare', forwardDamp: 1, jets: [] },
  // Remington 870 Police Magnum 18" heavy smoothbore bare crown
  rem870: { kind: 'bare', forwardDamp: 1, jets: [] },
  // Colt M1911A1 5.03" .45 ACP bare crowned muzzle
  m1911: { kind: 'bare', forwardDamp: 1, jets: [] },
  // WWII MG 42 conical muzzle recoil booster w/ radial gas vents
  mg42: {
    kind: 'flash_hider',
    forwardDamp: 0.88,
    jets: radialProngJets([0, 90, 180, -90], 1.55, 0.36),
  },
  // Mauser Karabiner 98k 600mm stepped military bare crown
  k98k: { kind: 'bare', forwardDamp: 1, jets: [] },
  // Thompson M1928A1 4-slot upward-venting Cutts anti-climb compensator
  thompson: {
    kind: 'brake',
    forwardDamp: 0.84,
    jets: [-1.8, -1.25, -0.7, -0.2].map((ox, idx) => ({
      offsetX: ox,
      offsetY: 0.38,
      offsetZ: 0,
      dir: [0.12, 0.98, 0] as [number, number, number],
      length: 1.55 - idx * 0.14,
      radius: 0.28,
      layer: (idx % 2 === 0 ? 0 : 1) as 0 | 1,
      intensity: 0.78 - idx * 0.1,
    })),
  },
  // General Electric GAU-8/A Avenger 7-barrel 30mm rotary cannon cluster
  gau8: {
    kind: 'flash_hider',
    forwardDamp: 0.94,
    jets: radialProngJets([0, 51, 103, 154, -154, -103, -51], 6.4, 1.45),
  },
};

const _jetUp = new THREE.Vector3(0, 1, 0);
const _jetDir = new THREE.Vector3();
const _jetQuat = new THREE.Quaternion();

interface BuiltJet {
  geometry: THREE.BufferGeometry;
  quaternion: THREE.Quaternion;
  spec: MuzzleJetSpec;
}

const jetGeoCache = new Map<WeaponId, BuiltJet[]>();

/** Cone with apex at the port and the expanding plume along the jet axis. */
function getMuzzleJets(weaponId: WeaponId): BuiltJet[] {
  const cached = jetGeoCache.get(weaponId);
  if (cached) return cached;
  const built: BuiltJet[] = MUZZLE_DEVICE_SPECS[weaponId].jets.map((spec) => {
    const geo = new THREE.ConeGeometry(
      spec.radius,
      spec.length,
      spec.layer === 0 ? 12 : 16,
      1,
      spec.layer === 1
    );
    geo.rotateX(Math.PI);
    geo.translate(0, spec.length / 2, 0);
    _jetDir.set(spec.dir[0], spec.dir[1], spec.dir[2]).normalize();
    _jetQuat.setFromUnitVectors(_jetUp, _jetDir);
    return { geometry: geo, quaternion: _jetQuat.clone(), spec };
  });
  jetGeoCache.set(weaponId, built);
  return built;
}

// HDR (>> 3.2) additive colours so ONLY pyrotechnic muzzle VFX cross the bloom threshold,
// never specular Lightformer reflections off machined steel or cutaway walls
const HDR_CORE = new THREE.Color(8.4, 5.8, 2.4);
const HDR_FLAME = new THREE.Color(5.6, 2.3, 0.52);
const HDR_DIAMOND = new THREE.Color(7.4, 6.4, 4.2);
const HDR_JET_CORE = new THREE.Color(6.8, 4.5, 1.8);
const HDR_JET_SHEATH = new THREE.Color(4.4, 1.65, 0.38);
const HDR_VENT = new THREE.Color(5.0, 2.7, 0.85);
const BRASS_GLOW = new THREE.Color('#ff6a1a');
const SMOKE_GREY = new THREE.Color('#cbc5be');
const SMOKE_HAZE = new THREE.Color('#dbe4ee');
const noSmokeRaycast = (): null => null;

const SMOKE_WISP_VERT_GLSL = /* glsl */ `
  varying vec3 vNormalView;
  void main() {
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SMOKE_WISP_FRAG_GLSL = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vNormalView;
  void main() {
    float rim = max(0.0, normalize(vNormalView).z);
    float feather = pow(rim, 2.55);
    gl_FragColor = vec4(uColor, uOpacity * feather);
  }
`;

const MAX_SHOCK_DIAMONDS = 5;
const DIAMOND_SLOTS = [0, 1, 2, 3, 4] as const;
const MUZZLE_PUFF_SLOTS = [0, 1, 2] as const;
const CASING_SLOTS = Array.from({ length: SPENT_CASING_POOL_SIZE }, (_, i) => i);
const SMOKE_SLOTS = Array.from({ length: SMOKE_WISP_POOL_SIZE }, (_, i) => i);

/** Warm-amber internal chamber deflagration bounce light constants (Matt Rittman slow-mo cutaway). */
export const CHAMBER_IGNITION_LIGHT_COLOR = '#ff9c42';
export const CHAMBER_IGNITION_WINDOW_START = 0.04;
export const CHAMBER_IGNITION_WINDOW_END = 0.24;

export type CaliberVfxTier =
  | 'archery'
  | 'pistol'
  | 'rifle'
  | 'heavy_50'
  | 'autocannon_30mm'
  | 'mbt_cannon';

export interface CaliberVfxClassScale {
  tier: CaliberVfxTier;
  smokeScale: number;
  diamondScale: number;
  puffDurationF: number;
  chamberBouncePeak: number;
}

/**
 * Classifies every caliber/ordnance profile into a calibrated VFX intensity & physical scale tier
 * (pistol < rifle < .50 BMG < 30mm GAU-8 < 88/120/125mm MBT; strictly zero for archery).
 */
export function resolveCaliberVfxClassScale(
  caliber: CaliberProfile
): CaliberVfxClassScale {
  if (caliber === 'arrow_400gr' || caliber === 'bolt_400gr') {
    return {
      tier: 'archery',
      smokeScale: 0,
      diamondScale: 0,
      puffDurationF: 0,
      chamberBouncePeak: 0,
    };
  }
  if (
    caliber === '125mm_apfsds' ||
    caliber === '120mm_apfsds' ||
    caliber === '88mm_pzgr39'
  ) {
    return {
      tier: 'mbt_cannon',
      smokeScale: 12.5,
      diamondScale: 5.2,
      puffDurationF: 0.36,
      chamberBouncePeak: 58,
    };
  }
  if (caliber === '30x173_gau8') {
    return {
      tier: 'autocannon_30mm',
      smokeScale: 4.6,
      diamondScale: 2.75,
      puffDurationF: 0.3,
      chamberBouncePeak: 26,
    };
  }
  if (caliber === '50_bmg') {
    return {
      tier: 'heavy_50',
      smokeScale: 2.1,
      diamondScale: 1.65,
      puffDurationF: 0.33,
      chamberBouncePeak: 11.5,
    };
  }
  if (
    caliber === '9mm_para' ||
    caliber === '45_acp' ||
    caliber === '357_magnum' ||
    caliber === '57_28' ||
    caliber === '9x39_subsonic'
  ) {
    return {
      tier: 'pistol',
      smokeScale: caliber === '9x39_subsonic' ? 0.65 : 0.92,
      diamondScale: caliber === '9x39_subsonic' ? 0.52 : 0.78,
      puffDurationF: 0.22,
      chamberBouncePeak: 5.8,
    };
  }
  if (caliber === '50_ae') {
    return {
      tier: 'pistol',
      smokeScale: 1.28,
      diamondScale: 1.05,
      puffDurationF: 0.25,
      chamberBouncePeak: 7.4,
    };
  }
  return {
    tier: 'rifle',
    smokeScale: caliber === '338_lapua' ? 1.55 : 1.24,
    diamondScale: caliber === '338_lapua' ? 1.22 : 1.0,
    puffDurationF: 0.27,
    chamberBouncePeak: caliber === '338_lapua' ? 9.2 : 7.8,
  };
}

/**
 * Evaluates the warm-amber chamber ignition bounce point-light intensity for firing phase `f ∈ [0, 1]`.
 * Strictly zero outside `f ∈ [0.04, 0.24]` and strictly zero for archery exhibits.
 * Strongly attenuated (`0.18x`) in opaque assembled view so chamber light never bleeds through closed steel,
 * while illuminating the bolt face, locking lugs & brass cartridge vividly in CT cutaway / X-ray mode.
 */
export function computeChamberIgnitionBounceIntensity(
  f: number,
  caliber: CaliberProfile,
  isArchery: boolean,
  isCutawayOrXray: boolean,
  pressure01 = 0.85
): number {
  if (
    isArchery ||
    !Number.isFinite(f) ||
    f < CHAMBER_IGNITION_WINDOW_START ||
    f > CHAMBER_IGNITION_WINDOW_END
  ) {
    return 0;
  }
  const vfx = resolveCaliberVfxClassScale(caliber);
  if (vfx.chamberBouncePeak <= 0) return 0;

  // Rapid primer ignition rise [0.04..0.11] -> bright combustion plateau [0.11..0.16] -> smooth rolloff [0.16..0.24]
  let env: number;
  if (f < 0.11) {
    const u = (f - CHAMBER_IGNITION_WINDOW_START) / (0.11 - CHAMBER_IGNITION_WINDOW_START);
    env = u * u * (3 - 2 * u);
  } else if (f <= 0.16) {
    env = 1.0;
  } else {
    const u = (f - 0.16) / (CHAMBER_IGNITION_WINDOW_END - 0.16);
    const inv = 1 - u;
    env = inv * inv * (3 - 2 * inv);
  }

  const pClamped = Number.isFinite(pressure01)
    ? Math.max(0, Math.min(1, pressure01))
    : 0;
  const pressureDrive = 0.35 + 0.65 * Math.max(pClamped, 0.25);
  const visibilityScale = isCutawayOrXray ? 1.0 : 0.18;
  return vfx.chamberBouncePeak * env * pressureDrive * visibilityScale;
}

// ============================================================================
// Physical recoil transform for the weapon assembly (Wave-2 ArmoryViewport hook)
// ============================================================================

export interface WeaponRecoilTransformOptions {
  /** Grip pivot [x, y] in weapon space (defaults derived from workbench meta) */
  pivot?: [number, number];
  /** Visual gain multiplier on the physical recoil (default 1) */
  gain?: number;
}

/**
 * Applies the 60Hz spring-damper recoil kick (−X), bolt battery micro-bounce,
 * bore rise (+Y) and muzzle-climb torque (rotation about the grip pivot, Z axis)
 * to `groupRef` imperatively inside `useFrame` (zero React re-renders, zero GC).
 * Restores the identity transform outside of Workbench firing mode.
 */
export function useWeaponRecoilTransform(
  groupRef: React.RefObject<THREE.Object3D | null>,
  options?: WeaponRecoilTransformOptions
): void {
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  }, [options]);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const st = useAppStore.getState();
    if (st.screen !== 'workbench' || st.mode !== 'firing') {
      if (g.position.x !== 0 || g.position.y !== 0 || g.rotation.z !== 0) {
        g.position.set(0, 0, 0);
        g.rotation.set(0, 0, 0);
      }
      return;
    }
    const phys = getArmoryPhysicsState();
    const opts = optsRef.current;
    const gain = opts?.gain ?? 1;
    const meta = getWeaponManifest(st.activeWeaponId).workbenchMeta;
    const isTank = meta.scaleProfile === 'main_battle_tank';
    const isPistol = meta.scaleProfile === 'pistol';
    const px =
      opts?.pivot?.[0] ??
      (isTank ? 0 : meta.chamberGlowPos[0] - (isPistol ? 2.5 : 4.5));
    const py =
      opts?.pivot?.[1] ??
      (isTank ? -90.0 : meta.chamberGlowPos[1] - (isPistol ? 4.5 : 5.5));
    const th = phys.recoilPitchZ * gain;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const dx = (phys.recoilOffsetX + phys.boltBounceX * 0.35) * gain;
    const dy = phys.recoilOffsetY * gain;
    // p' = R(p − P) + P + offset  →  position = P − R·P + offset
    g.rotation.set(0, 0, th);
    g.position.set(px - (px * c - py * s) + dx, py - (px * s + py * c) + dy, 0);
  });
}

/** Declarative wrapper: `<WeaponRecoilGroup>{parts}</WeaponRecoilGroup>`. */
export const WeaponRecoilGroup: React.FC<
  React.PropsWithChildren<WeaponRecoilTransformOptions>
> = ({ children, pivot, gain }) => {
  const ref = useRef<THREE.Group>(null);
  useWeaponRecoilTransform(ref, { pivot, gain });
  return <group ref={ref}>{children}</group>;
};

// ============================================================================
// World-space persistent FX: rigid-body spent brass on the mat + smoke wisps
// (kept OUTSIDE any recoil group so resting brass never jitters with the gun)
// ============================================================================

export const ArmoryWorldFx: React.FC = () => {
  const screen = useAppStore((s) => s.screen);
  const mode = useAppStore((s) => s.mode);
  const malfunctionActive = useAppStore((s) => s.malfunctionActive);
  const casingGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const casingMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const casingPrimerRefs = useRef<(THREE.Mesh | null)[]>([]);
  const casingSootRefs = useRef<(THREE.Mesh | null)[]>([]);
  const casingMatRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const smokeMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const smokeMatRefs = useRef<(THREE.ShaderMaterial | null)[]>([]);

  const smokeGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 2), []);
  const smokeShaderArgs = useMemo(
    () =>
      SMOKE_SLOTS.map(
        () =>
          [
            {
              uniforms: {
                uColor: { value: SMOKE_GREY.clone() },
                uOpacity: { value: 0 },
              },
              vertexShader: SMOKE_WISP_VERT_GLSL,
              fragmentShader: SMOKE_WISP_FRAG_GLSL,
            },
          ] as [THREE.ShaderMaterialParameters]
      ),
    []
  );
  const initialBundle = useMemo(() => getCaliberGeometries('9mm_para'), []);

  useEffect(() => {
    return () => {
      smokeGeo.dispose();
    };
  }, [smokeGeo]);

  useFrame(() => {
    const casings = getSpentCasingPool();
    for (let i = 0; i < casings.length; i++) {
      const c = casings[i];
      const grp = casingGroupRefs.current[i];
      if (!grp) continue;
      grp.visible = c.active;
      if (!c.active) continue;
      const bundle = getCaliberGeometries(c.caliber);
      const mesh = casingMeshRefs.current[i];
      if (mesh && mesh.geometry !== bundle.caseGeo) {
        mesh.geometry = bundle.caseGeo;
        const primer = casingPrimerRefs.current[i];
        if (primer) primer.geometry = bundle.spentPrimerGeo;
        const soot = casingSootRefs.current[i];
        if (soot) soot.geometry = bundle.sootRingGeo;
        const mat = casingMatRefs.current[i];
        if (mat) mat.color.copy(CALIBER_CASE_COLORS[c.caliber]);
      }
      grp.position.set(c.px, c.py, c.pz);
      grp.rotation.set(c.rx, c.ry, c.rz);
      grp.scale.setScalar(c.scale);
      const mat = casingMatRefs.current[i];
      if (mat) mat.emissiveIntensity = c.heat01 * 0.85;
    }

    const wisps = getSmokeWispPool();
    for (let i = 0; i < wisps.length; i++) {
      const w = wisps[i];
      const mesh = smokeMeshRefs.current[i];
      if (!mesh) continue;
      const softAlpha =
        Math.min(0.16, w.opacity * 0.46) / (1 + 0.32 * w.size);
      const show = w.active && softAlpha > 0.003;
      mesh.visible = show;
      if (!show) continue;
      mesh.position.set(w.px, w.py, w.pz);
      mesh.rotation.set(w.seed, w.ageSec * 0.45, w.seed * 0.5);
      mesh.scale.set(w.size * 1.28, w.size * 0.88, w.size * 0.96);
      const mat = smokeMatRefs.current[i];
      if (mat) {
        mat.uniforms.uOpacity.value = softAlpha;
        mat.uniforms.uColor.value.copy(
          w.kind === 3 ? SMOKE_HAZE : SMOKE_GREY
        );
      }
    }
  });

  if (screen !== 'workbench' || mode !== 'firing' || malfunctionActive) {
    return null;
  }

  return (
    <group>
      {CASING_SLOTS.map((i) => (
        <group
          key={`casing-${i}`}
          ref={(el) => {
            casingGroupRefs.current[i] = el;
          }}
          visible={false}
        >
          <mesh
            ref={(el) => {
              casingMeshRefs.current[i] = el;
            }}
            geometry={initialBundle.caseGeo}
            castShadow
            renderOrder={2}
          >
            <meshStandardMaterial
              ref={(el) => {
                casingMatRefs.current[i] = el;
              }}
              color={CALIBER_VISUAL_SPECS['9mm_para'].caseColor}
              metalness={0.88}
              roughness={0.24}
              emissive={BRASS_GLOW}
              emissiveIntensity={0}
            />
          </mesh>
          <mesh
            ref={(el) => {
              casingPrimerRefs.current[i] = el;
            }}
            geometry={initialBundle.spentPrimerGeo}
            renderOrder={2}
          >
            <meshStandardMaterial color="#cbd5e1" metalness={0.88} roughness={0.25} />
          </mesh>
          <mesh
            ref={(el) => {
              casingSootRefs.current[i] = el;
            }}
            geometry={initialBundle.sootRingGeo}
            renderOrder={3}
          >
            <meshStandardMaterial
              color="#1c1917"
              metalness={0.08}
              roughness={0.92}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
        </group>
      ))}

      {SMOKE_SLOTS.map((i) => (
        <mesh
          key={`smoke-${i}`}
          ref={(el) => {
            smokeMeshRefs.current[i] = el;
          }}
          geometry={smokeGeo}
          raycast={noSmokeRaycast}
          visible={false}
          renderOrder={11}
        >
          <shaderMaterial
            ref={(el) => {
              smokeMatRefs.current[i] = el;
            }}
            args={smokeShaderArgs[i]}
            transparent
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
};

// ============================================================================
// BallisticsSystem — in-gun cartridge kinematics + muzzle / gas VFX + physics
// ============================================================================

export interface BallisticsSystemProps {
  /**
   * Render the world-space brass & smoke field inside this component (default).
   * Pass `false` when wrapping BallisticsSystem in `WeaponRecoilGroup` and
   * mounting `<ArmoryWorldFx />` outside the recoiling assembly instead.
   */
  worldFx?: boolean;
}

export const BallisticsSystem: React.FC<BallisticsSystemProps> = ({
  worldFx = true,
}) => {
  const screen = useAppStore((s) => s.screen);
  const mode = useAppStore((s) => s.mode);
  const malfunctionActive = useAppStore((s) => s.malfunctionActive);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const showEdges = useAppStore((s) => s.showEdges);

  const manifest = getWeaponManifest(activeWeaponId);
  const caliberProfile = manifest.caliberProfile;
  const meta = manifest.workbenchMeta;
  const calSpec = CALIBER_VISUAL_SPECS[caliberProfile];
  const roundFit = WEAPON_ROUND_FIT[activeWeaponId];
  const ballisticSpec = getCaliberBallisticsSpec(caliberProfile);
  const deviceSpec = MUZZLE_DEVICE_SPECS[activeWeaponId];

  const {
    caseGeo,
    bulletGeo,
    livePrimerGeo,
    spentPrimerGeo,
    sootRingGeo,
    craterSootGeo,
  } = useMemo(() => getCaliberGeometries(caliberProfile), [caliberProfile]);

  const jets = useMemo(() => getMuzzleJets(activeWeaponId), [activeWeaponId]);

  const is50Bmg = caliberProfile === '50_bmg';
  const is50Ae = caliberProfile === '50_ae';
  const isTankActive =
    meta.scaleProfile === 'main_battle_tank' || isTankWeapon(activeWeaponId);
  const isM82Brake = activeWeaponId === 'm82a1';
  const isArcheryActive = isArcheryWeapon(activeWeaponId);
  const useMultiToneCartridge =
    isArcheryActive ||
    isTankCaliber(caliberProfile) ||
    caliberProfile === '12_gauge' ||
    caliberProfile === '357_magnum';
  const diamondCount = Math.min(MAX_SHOCK_DIAMONDS, ballisticSpec.shockDiamonds);

  const spentCaseRef = useRef<THREE.Group>(null);
  const spentCaseMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const chamberLivePrimerRef = useRef<THREE.Mesh>(null);
  const chamberLivePrimerMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const chamberStruckGroupRef = useRef<THREE.Group>(null);
  const spentPrimerMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const spentSootMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const bulletGroupRef = useRef<THREE.Group>(null);
  const streakMeshRef = useRef<THREE.Mesh>(null);

  const chamberFlashRef = useRef<THREE.Mesh>(null);
  const chamberLightRef = useRef<THREE.PointLight>(null);

  const gasPortFlashRef = useRef<THREE.Mesh>(null);
  const ventFlashRef = useRef<THREE.Mesh>(null);
  const ventFlashMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const muzzleGroupRef = useRef<THREE.Group>(null);
  const muzzleOuterMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const muzzleCoreMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const muzzleBallRef = useRef<THREE.Mesh>(null);
  const muzzleBallMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const diamondMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const diamondMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const diamondHaloMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const diamondHaloMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const muzzlePuffMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const muzzlePuffMatRefs = useRef<(THREE.ShaderMaterial | null)[]>([]);
  const jetMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const muzzleLightRef = useRef<THREE.PointLight>(null);

  const muzzlePuffGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 2), []);
  const muzzlePuffShaderArgs = useMemo(
    () =>
      MUZZLE_PUFF_SLOTS.map(
        () =>
          [
            {
              uniforms: {
                uColor: { value: SMOKE_GREY.clone() },
                uOpacity: { value: 0 },
              },
              vertexShader: SMOKE_WISP_VERT_GLSL,
              fragmentShader: SMOKE_WISP_FRAG_GLSL,
            },
          ] as [THREE.ShaderMaterialParameters]
      ),
    []
  );

  useEffect(() => {
    return () => {
      muzzlePuffGeo.dispose();
    };
  }, [muzzlePuffGeo]);

  const shockRingRef = useRef<THREE.Group | THREE.Mesh>(null);
  const shockRingMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const blastRingRef = useRef<THREE.Mesh>(null);
  const blastRingMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const magnumRingRef = useRef<THREE.Group>(null);
  const magnumRingOuterMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const magnumRingCoreMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const nextRoundRef = useRef<THREE.Group>(null);
  const nextRoundInnerRef = useRef<THREE.Group>(null);

  // 60Hz quantitative physics step — runs every frame (barrels keep cooling
  // and brass keeps settling even while paused), events only in firing mode.
  useFrame((_, delta) => {
    const state = useAppStore.getState();
    const weaponId = state.activeWeaponId;
    const curManifest = getWeaponManifest(weaponId);
    const curMeta = curManifest.workbenchMeta;
    const plugin = getLoadedWeaponPlugin(weaponId);
    const firing =
      state.screen === 'workbench' &&
      state.mode === 'firing' &&
      !state.malfunctionActive;
    const f = playbackClock.getState().animatedFireProgress;

    const inp = _physicsInput;
    inp.weaponId = weaponId;
    inp.caliber = curManifest.caliberProfile;
    inp.fireProgress = f;
    inp.firing = firing && !!plugin;
    inp.floorY = curMeta.gridY + MAT_SURFACE_OFFSET;
    inp.matMinX = curMeta.chamberGlowPos[0] - MAT_HALF_X;
    inp.matMaxX = curMeta.chamberGlowPos[0] + MAT_HALF_X;
    inp.matMinZ = -MAT_HALF_Z;
    inp.matMaxZ = MAT_HALF_Z;
    const attLoadout = getWeaponAttachmentLoadout(weaponId);
    const attPhys = getActiveWeaponAttachmentPhysics(weaponId);
    inp.muzzleX =
      computeMountedMuzzleExitX(weaponId, attLoadout.muzzle, curMeta.muzzlePos[0]) +
      computeMuzzleRecoilShiftX(weaponId, f);
    inp.muzzleY = curMeta.muzzlePos[1];
    inp.muzzleZ = curMeta.muzzlePos[2];
    inp.recoilMultiplier = attPhys.recoilRiseMultiplier;
    inp.casingScale = WEAPON_ROUND_FIT[weaponId].roundScale;
    if (plugin) {
      const ej = getEjectionSpawnSpec(weaponId, plugin);
      inp.ejectPortX = ej.px;
      inp.ejectPortY = ej.py;
      inp.ejectPortZ = ej.pz;
      inp.ejectRotX = ej.rx;
      inp.ejectRotY = ej.ry;
      inp.ejectRotZ = ej.rz;
      inp.hasGasVent = ej.hasVent;
      inp.gasVentX = ej.vx;
      inp.gasVentY = ej.vy;
      inp.gasVentZ = ej.vz;
    }
    // Slow-motion playback scales physical time so brass & smoke slow down too
    const timeScale = firing ? state.fireSpeedMultiplier : 1;
    stepArmoryPhysics(Math.min(delta, 0.05) * timeScale, inp);
  });

  useFrame(() => {
    const state = useAppStore.getState();
    if (
      state.screen !== 'workbench' ||
      state.mode !== 'firing' ||
      state.malfunctionActive
    ) {
      return;
    }

    const weaponId = state.activeWeaponId;
    const plugin = getLoadedWeaponPlugin(weaponId);
    if (!plugin) return;

    const f = playbackClock.getState().animatedFireProgress;
    const curManifest = getWeaponManifest(weaponId);
    const curProfile = curManifest.caliberProfile;
    const curMeta = curManifest.workbenchMeta;
    const curSpec = CALIBER_VISUAL_SPECS[curProfile];
    const curFit = WEAPON_ROUND_FIT[weaponId];
    const curBallistic = getCaliberBallisticsSpec(curProfile);
    const curDevice = MUZZLE_DEVICE_SPECS[weaponId];
    const timing = getWeaponFiringTiming(weaponId);
    const st = plugin.computeBallisticsState(f);
    const muzzleShiftX = computeMuzzleRecoilShiftX(weaponId, f);
    const phys = getArmoryPhysicsState();
    const isArchery = isArcheryWeapon(weaponId);
    const isTank =
      curMeta.scaleProfile === 'main_battle_tank' || isTankWeapon(weaponId);
    const ib = evaluateInternalBallisticsInto(
      curProfile,
      f,
      _ballisticsSample,
      timing
    );

    // 1. Chambered / extracting case — handed over to the rigid-body pool at ejectF
    // (MBTs run bespoke 1:1 stub-base / 88mm brass ejection arcs inside plugin.computeBallisticsState)
    if (spentCaseRef.current && spentCaseMatRef.current) {
      spentCaseRef.current.visible = isTank
        ? st.spentCaseVisible
        : !isArchery && st.spentCaseVisible && f < timing.ejectF;
      spentCaseRef.current.position.set(
        st.spentCasePos[0],
        st.spentCasePos[1],
        st.spentCasePos[2]
      );
      spentCaseRef.current.rotation.set(
        st.spentCaseRot[0],
        st.spentCaseRot[1],
        st.spentCaseRot[2]
      );
      spentCaseRef.current.scale.setScalar(curFit.roundScale);

      // Fresh-fired brass glows faintly from residual propellant heat
      const caseHeat =
        f >= timing.ignitionF ? Math.min(1, (f - timing.ignitionF) / 0.08) : 0;
      spentCaseMatRef.current.emissiveIntensity = caseHeat * 0.55;

      const isTrans = st.spentCaseOpacity < 0.99;
      spentCaseMatRef.current.opacity = st.spentCaseOpacity;
      spentCaseMatRef.current.transparent = isTrans;

      const isStruck = f >= curFit.ignitionF;
      if (chamberLivePrimerRef.current && chamberLivePrimerMatRef.current) {
        chamberLivePrimerRef.current.visible = !isStruck;
        chamberLivePrimerMatRef.current.opacity = st.spentCaseOpacity;
        chamberLivePrimerMatRef.current.transparent = isTrans;
      }
      if (chamberStruckGroupRef.current) {
        chamberStruckGroupRef.current.visible = isStruck;
      }
      if (spentPrimerMatRef.current) {
        spentPrimerMatRef.current.opacity = st.spentCaseOpacity;
        spentPrimerMatRef.current.transparent = isTrans;
      }
      if (spentSootMatRef.current) {
        spentSootMatRef.current.opacity = st.spentCaseOpacity * 0.92;
        spentSootMatRef.current.transparent = true;
      }
    }

    // 2. Projectile + supersonic / aerodynamic flight trail
    // For archery platforms, the hero CSG arrow/bolt BOM parts already fly along `bulletPos`
    // in PartActor; hide duplicate `bulletGroupRef` to avoid Z-fighting while keeping air-wake streak.
    if (bulletGroupRef.current) {
      bulletGroupRef.current.visible = !isArchery && st.bulletVisible;
      bulletGroupRef.current.position.set(
        st.bulletPos[0],
        st.bulletPos[1] + phys.barrelWhipY,
        st.bulletPos[2]
      );
      bulletGroupRef.current.rotation.set(f * (isTank ? 16 : 42), 0, 0);
      bulletGroupRef.current.scale.setScalar(curFit.roundScale);
    }

    if (streakMeshRef.current) {
      const showStreak = st.bulletVisible && st.streakLength > 0.1;
      streakMeshRef.current.visible = showStreak;
      if (showStreak) {
        streakMeshRef.current.scale.set(
          st.streakLength,
          curSpec.streakThickness,
          curSpec.streakThickness
        );
        streakMeshRef.current.position.set(
          st.bulletPos[0] - st.streakLength * 0.5 - (isTank ? 12.0 : 0.35),
          st.bulletPos[1] + phys.barrelWhipY,
          st.bulletPos[2]
        );
      }
    }

    // 3. Chamber ignition glow + synchronized warm-amber breech bounce point-light (`f ∈ [0.04, 0.24]`)
    const p01 = ib.pressure01;
    const isCutawayOrXray = state.sectionCut || state.xrayShells;
    const calVfx = resolveCaliberVfxClassScale(curProfile);
    if (chamberFlashRef.current) {
      const intensity = isArchery
        ? 0
        : Math.max(st.chamberFlashIntensity, p01 * 0.9);
      chamberFlashRef.current.visible = !isArchery && intensity > 0.02;
      chamberFlashRef.current.position.set(
        curMeta.chamberGlowPos[0] + muzzleShiftX * 0.65,
        curMeta.chamberGlowPos[1],
        curMeta.chamberGlowPos[2]
      );
      const baseChamberScale = isTank
        ? 8.5
        : curProfile === '30x173_gau8'
          ? 2.8
          : curProfile === '50_bmg'
            ? 1.25
            : curProfile === '338_lapua'
              ? 1.05
              : 0.72;
      const s = baseChamberScale + intensity * (isTank ? 6.5 : 0.75);
      chamberFlashRef.current.scale.set(s * 1.45, s, s);
      (chamberFlashRef.current.material as THREE.MeshBasicMaterial).opacity =
        intensity * 0.86;
    }

    if (chamberLightRef.current) {
      const bounceIntensity = computeChamberIgnitionBounceIntensity(
        f,
        curProfile,
        isArchery,
        isCutawayOrXray,
        Math.max(st.chamberFlashIntensity, p01)
      );
      chamberLightRef.current.intensity = bounceIntensity;
      chamberLightRef.current.position.set(
        curMeta.chamberGlowPos[0] + muzzleShiftX * 0.65 + (isTank ? 4.0 : 0.3),
        curMeta.chamberGlowPos[1],
        curMeta.chamberGlowPos[2] + (isTank ? 16.0 : 1.15)
      );
    }

    // 3b. Gas-block / piston port tap glow (driven by quantitative port pressure; also bore evacuator purge on MBTs)
    const gasPort01 = isArchery
      ? 0
      : Math.min(
          1,
          ib.gasPortPressureMPa / Math.max(1, curBallistic.peakPressureMPa * 0.25)
        );
    if (gasPortFlashRef.current) {
      const gi = isArchery
        ? 0
        : isTank
          ? st.gasPortFlashIntensity
          : Math.max(st.gasPortFlashIntensity, gasPort01);
      const activeGas = !isArchery && gi > 0.02;
      gasPortFlashRef.current.visible = activeGas;
      if (activeGas) {
        gasPortFlashRef.current.position.set(
          st.gasPortPos[0],
          st.gasPortPos[1],
          st.gasPortPos[2]
        );
        const gs = isTank ? 6.5 + gi * 7.5 : 0.65 + gi * 0.85;
        gasPortFlashRef.current.scale.set(gs * 1.6, gs, gs);
        (gasPortFlashRef.current.material as THREE.MeshBasicMaterial).opacity =
          gi * 0.85;
      }
    }

    // 3c. M4A1 bolt-carrier gas-key exhaust vent puff (right-side ejection port)
    if (ventFlashRef.current && ventFlashMatRef.current) {
      let vi = 0;
      if (weaponId === 'm4a1' && f > timing.muzzleExitF) {
        const u = (f - timing.muzzleExitF) / 0.07;
        vi = u < 1 ? Math.sin(u * Math.PI) * Math.max(0.35, gasPort01) : 0;
      }
      ventFlashRef.current.visible = vi > 0.02;
      if (vi > 0.02) {
        const ej = getEjectionSpawnSpec(weaponId, plugin);
        const vs = 0.35 + vi * 0.75;
        ventFlashRef.current.position.set(ej.vx, ej.vy, ej.vz + vs * 0.4);
        ventFlashRef.current.scale.set(vs * 1.3, vs * 0.8, vs * 1.6);
        ventFlashMatRef.current.opacity = vi * 0.75;
      }
    }

    // 4. Muzzle blast: core fireball + flame cone + Mach shock diamonds + device jets
    const attLoadout = getWeaponAttachmentLoadout(weaponId);
    const attPhys = getActiveWeaponAttachmentPhysics(weaponId);
    const hasCustomMuzzle = attLoadout.muzzle !== 'none';
    const liveMuzzleX =
      computeMountedMuzzleExitX(weaponId, attLoadout.muzzle, curMeta.muzzlePos[0]) +
      muzzleShiftX;
    const muzzleFlashGain = hasCustomMuzzle
      ? Math.max(0.1, 1 - attPhys.flashAttenuation) *
        (attLoadout.muzzle === 'muzzle_brake' ? 0.56 : 1.0)
      : 1.0;

    const plumeOpacity = isArchery ? 0 : st.muzzlePlumeOpacity;
    const plumeActive = !isArchery && plumeOpacity > 0.02;
    const flicker = 0.86 + 0.14 * Math.sin(phys.simTimeSec * 97.0);
    if (muzzleGroupRef.current) {
      muzzleGroupRef.current.visible = plumeActive;
      if (plumeActive) {
        muzzleGroupRef.current.position.set(
          liveMuzzleX,
          curMeta.muzzlePos[1] + phys.barrelWhipY,
          curMeta.muzzlePos[2]
        );
        const s =
          st.muzzlePlumeScale *
          curSpec.flashScaleMult *
          (attLoadout.muzzle === 'suppressor'
            ? 0.42
            : attLoadout.muzzle === 'flash_hider'
              ? 0.65
              : 1.0);
        muzzleGroupRef.current.scale.setScalar(s);
        const fwd = (hasCustomMuzzle ? 1.0 : curDevice.forwardDamp) * muzzleFlashGain;

        if (muzzleOuterMatRef.current) {
          muzzleOuterMatRef.current.opacity = plumeOpacity * 0.5 * fwd * flicker;
        }
        if (muzzleCoreMatRef.current) {
          muzzleCoreMatRef.current.opacity = plumeOpacity * 0.85 * fwd;
        }
        if (muzzleBallRef.current && muzzleBallMatRef.current) {
          muzzleBallMatRef.current.opacity =
            plumeOpacity * 0.9 * flicker * muzzleFlashGain;
          const bs = 0.55 + 0.25 * flicker;
          muzzleBallRef.current.scale.set(bs * 1.25, bs, bs);
        }

        // Supersonic under-expanded jet: layered standing Mach shock diamonds (incandescent core + flame halo)
        const dClassScale = Math.min(2.2, Math.max(0.7, calVfx.diamondScale));
        for (let i = 0; i < MAX_SHOCK_DIAMONDS; i++) {
          const mesh = diamondMeshRefs.current[i];
          const mat = diamondMatRefs.current[i];
          const halo = diamondHaloMeshRefs.current[i];
          const haloMat = diamondHaloMatRefs.current[i];
          if (!mesh || !mat) continue;
          const on =
            i < curBallistic.shockDiamonds &&
            attLoadout.muzzle !== 'suppressor';
          mesh.visible = on;
          if (halo) halo.visible = on;
          if (!on) continue;
          const spacing = (0.95 + i * 0.08) * (0.82 + 0.18 * dClassScale);
          const dx = 0.75 + i * spacing;
          mesh.position.x = dx;
          const shrink = 1 - i * 0.14;
          const pulse = 0.92 + 0.08 * Math.sin(phys.simTimeSec * 140 + i * 1.7);
          const sx = 0.42 * shrink * pulse * (0.78 + 0.22 * dClassScale);
          const sy = 0.2 * shrink * (0.82 + 0.18 * dClassScale);
          mesh.scale.set(sx, sy, sy);
          mat.opacity = plumeOpacity * (0.95 - i * 0.15) * fwd;
          if (halo && haloMat) {
            halo.position.x = dx + 0.06;
            halo.scale.set(sx * 1.62, sy * 1.85, sy * 1.85);
            haloMat.opacity = plumeOpacity * (0.44 - i * 0.07) * fwd * flicker;
          }
        }

        const jetsNow = getMuzzleJets(weaponId);
        for (let i = 0; i < jetsNow.length; i++) {
          const mat = jetMatRefs.current[i];
          if (mat) {
            // Suppress stock factory muzzle-device jets when an aftermarket muzzle attachment is mounted
            mat.opacity = hasCustomMuzzle
              ? 0
              : plumeOpacity *
                jetsNow[i].spec.intensity *
                (jetsNow[i].spec.layer === 0 ? 1 : flicker);
          }
        }
      }
    }

    if (muzzleLightRef.current) {
      muzzleLightRef.current.intensity = isArchery
        ? 0
        : plumeOpacity *
          (isTank ? 65 : isHighMagnumCaliber(curProfile) ? 9 : 5) *
          muzzleFlashGain;
      muzzleLightRef.current.position.set(
        liveMuzzleX + (isTank ? 24 : 1.2),
        curMeta.muzzlePos[1] + phys.barrelWhipY,
        curMeta.muzzlePos[2] + (isTank ? 10 : 0.6)
      );
    }

    // 4b. Primary shock collar at the crown
    if (shockRingRef.current && shockRingMatRef.current) {
      shockRingRef.current.visible =
        plumeActive && attLoadout.muzzle !== 'suppressor';
      if (shockRingRef.current.visible) {
        shockRingRef.current.position.set(
          liveMuzzleX + (isTank ? 4.5 : 0.25),
          curMeta.muzzlePos[1] + phys.barrelWhipY,
          curMeta.muzzlePos[2]
        );
        const ringBoost =
          curProfile === '125mm_apfsds'
            ? 6.2
            : curProfile === '120mm_apfsds'
              ? 7.2
              : curProfile === '88mm_pzgr39'
                ? 9.5
                : curProfile === '50_bmg'
                  ? 2.45
                  : curProfile === '50_ae'
                    ? 2.05
                    : curProfile === '338_lapua'
                      ? 1.85
                      : 1.5;
        const rs = st.muzzlePlumeScale * ringBoost;
        shockRingRef.current.scale.set(rs, rs, rs);
        shockRingMatRef.current.opacity = plumeOpacity * 0.62 * muzzleFlashGain;
      }
    }

    // 4c. Expanding spherical blast-wave front (Mach disk → acoustic shock; muted on subsonic VSS & suppressors)
    if (blastRingRef.current && blastRingMatRef.current) {
      const u = (f - timing.muzzleExitF) / 0.1;
      const on =
        !isArchery &&
        curProfile !== '9x39_subsonic' &&
        attLoadout.muzzle !== 'suppressor' &&
        u > 0 &&
        u < 1;
      blastRingRef.current.visible = on;
      if (on) {
        const energyScale = isTank
          ? 14.0
          : Math.cbrt(curBallistic.muzzleEnergyJ / 1500);
        const rad = (0.6 + 7.5 * Math.sqrt(u)) * energyScale;
        blastRingRef.current.position.set(
          liveMuzzleX + rad * 0.35,
          curMeta.muzzlePos[1],
          curMeta.muzzlePos[2]
        );
        blastRingRef.current.scale.setScalar(rad);
        blastRingMatRef.current.opacity =
          (1 - u) * (1 - u) * 0.38 * Math.max(0.35, muzzleFlashGain);
      }
    }

    if (
      magnumRingRef.current &&
      magnumRingOuterMatRef.current &&
      magnumRingCoreMatRef.current
    ) {
      const activeMagnum = !isArchery && curProfile === '50_ae' && plumeActive;
      magnumRingRef.current.visible = activeMagnum;
      if (activeMagnum) {
        const ms = 0.85 + st.muzzlePlumeScale * 1.45;
        magnumRingRef.current.position.set(
          curMeta.muzzlePos[0] + 1.4 + st.muzzlePlumeScale * 1.65,
          curMeta.muzzlePos[1] + phys.barrelWhipY,
          curMeta.muzzlePos[2]
        );
        magnumRingRef.current.scale.set(ms * 0.85, ms, ms);
        magnumRingOuterMatRef.current.opacity = plumeOpacity * 0.78;
        magnumRingCoreMatRef.current.opacity = plumeOpacity * 0.95;
      }
    }

    // 4d. Lingering translucent propellant gunsmoke puff expanding forward/upward from active muzzle
    const puffStart = timing.muzzleExitF;
    const puffDur = calVfx.puffDurationF;
    const isSuppressed =
      attLoadout.muzzle === 'suppressor' || curProfile === '9x39_subsonic';
    const isBrakeMounted = attLoadout.muzzle === 'muzzle_brake';
    for (let i = 0; i < MUZZLE_PUFF_SLOTS.length; i++) {
      const pMesh = muzzlePuffMeshRefs.current[i];
      const pMat = muzzlePuffMatRefs.current[i];
      if (!pMesh || !pMat) continue;
      const stagger = i * 0.022;
      const uRaw = puffDur > 0 ? (f - (puffStart + stagger)) / puffDur : -1;
      const activePuff = !isArchery && calVfx.smokeScale > 0 && uRaw > 0 && uRaw < 1;
      pMesh.visible = activePuff;
      if (!activePuff) continue;
      const easeOut = 1 - (1 - uRaw) * (1 - uRaw);
      const fade = Math.sin(Math.min(1, uRaw * 3.4) * (Math.PI * 0.5)) * Math.pow(1 - uRaw, 1.45);
      const sMult = isSuppressed ? 0.56 : isBrakeMounted ? 0.88 : 1.0;
      const baseR = (0.58 + 2.35 * easeOut + i * 0.34) * calVfx.smokeScale * sMult;
      const driftX = (0.7 + 4.8 * easeOut + i * 0.85) * calVfx.smokeScale * (isSuppressed ? 0.62 : 1.0);
      const driftY = (0.18 + 1.55 * uRaw * uRaw + i * 0.22) * calVfx.smokeScale;
      const lateralSpread = isBrakeMounted ? (i === 1 ? 1.15 : i === 2 ? -1.15 : 0) * calVfx.smokeScale * easeOut : (i - 1) * 0.14 * calVfx.smokeScale;
      pMesh.position.set(
        liveMuzzleX + driftX,
        curMeta.muzzlePos[1] + phys.barrelWhipY + driftY,
        curMeta.muzzlePos[2] + lateralSpread
      );
      pMesh.rotation.set(i * 1.1, uRaw * 1.4 + i * 0.7, i * 0.5);
      pMesh.scale.set(
        baseR * (isBrakeMounted ? 0.92 : 1.32),
        baseR * 0.86,
        baseR * (isBrakeMounted ? 1.38 : 0.95)
      );
      pMat.uniforms.uOpacity.value =
        fade * (isSuppressed ? 0.11 : isTank ? 0.22 : 0.17) * (1 - i * 0.16);
      pMat.uniforms.uColor.value.copy(isSuppressed ? SMOKE_HAZE : SMOKE_GREY);
    }

    // 5. Magazine / Quiver feed round (Slot 0; reserve stack rendered by MagazineAmmoStack)
    // MBTs animate their own sculptural 3D ready rounds inside the Blender GLB BOM (`*_ready_round` / `*_loading_tray`),
    // so hide duplicate `nextRoundRef` on tanks to prevent turret-interior Z-fighting.
    if (nextRoundRef.current) {
      nextRoundRef.current.visible = !isTank && (!isArchery || f < 0.7);
      nextRoundRef.current.position.set(
        st.nextRoundPos[0],
        st.nextRoundPos[1],
        st.nextRoundPos[2]
      );
      nextRoundRef.current.rotation.set(0, st.nextRoundRotY ?? 0, st.nextRoundRotZ);
      nextRoundRef.current.scale.setScalar(curFit.roundScale);
    }
    if (nextRoundInnerRef.current) {
      if (isArchery) {
        nextRoundInnerRef.current.position.x = curFit.magLocalShiftX;
      } else {
        const uFeed = THREE.MathUtils.clamp((f - 0.58) / 0.24, 0, 1);
        const feedBlend = uFeed * uFeed * (3 - 2 * uFeed);
        nextRoundInnerRef.current.position.x =
          curFit.magLocalShiftX * (1 - feedBlend) + phys.boltBounceX * feedBlend;
      }
    }
  });

  if (screen !== 'workbench' || mode !== 'firing' || malfunctionActive) {
    return null;
  }

  return (
    <group>
      {worldFx && <ArmoryWorldFx />}
      <GasFlowVisualizer />

      {/* 1. Chambered / Extracted Brass Case + Live/Struck Boxer Primer */}
      <group ref={spentCaseRef} position={meta.chamberGlowPos} scale={roundFit.roundScale}>
        <mesh key={`spent-case-${caliberProfile}`} geometry={caseGeo} renderOrder={2}>
          <meshStandardMaterial
            ref={spentCaseMatRef}
            color={useMultiToneCartridge ? '#ffffff' : calSpec.caseColor}
            vertexColors={useMultiToneCartridge}
            metalness={caliberProfile === '12_gauge' ? 0.35 : 0.86}
            roughness={caliberProfile === '12_gauge' ? 0.42 : 0.21}
            emissive={BRASS_GLOW}
            emissiveIntensity={0}
          />
          {showEdges && <Edges threshold={36} color="#854d0e" />}
        </mesh>

        {/* Un-struck Nickel Boxer Primer Cup (visible before firing-pin strike) */}
        <mesh ref={chamberLivePrimerRef} geometry={livePrimerGeo} renderOrder={2}>
          <meshStandardMaterial
            ref={chamberLivePrimerMatRef}
            color={calSpec.primerColor}
            metalness={0.92}
            roughness={0.17}
          />
        </mesh>

        {/* Struck Boxer Primer Cup with Firing-Pin Indent & Carbon Soot Ring (f >= ignitionF) */}
        <group ref={chamberStruckGroupRef} visible={false}>
          <mesh geometry={spentPrimerGeo} renderOrder={2}>
            <meshStandardMaterial
              ref={spentPrimerMatRef}
              color="#cbd5e1"
              metalness={0.88}
              roughness={0.25}
            />
          </mesh>
          <mesh geometry={sootRingGeo} renderOrder={3}>
            <meshStandardMaterial
              ref={spentSootMatRef}
              color="#1c1917"
              metalness={0.08}
              roughness={0.92}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
          <mesh geometry={craterSootGeo} renderOrder={3}>
            <meshStandardMaterial
              color="#1c1917"
              metalness={0.1}
              roughness={0.9}
              side={THREE.DoubleSide}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
        </group>
      </group>

      {/* 2. Fired Jacketed Projectile */}
      <group ref={bulletGroupRef} position={meta.chamberGlowPos} scale={roundFit.roundScale}>
        <mesh key={`bullet-${caliberProfile}`} geometry={bulletGeo} renderOrder={2}>
          <meshStandardMaterial
            color={useMultiToneCartridge ? '#ffffff' : calSpec.bulletColor}
            vertexColors={useMultiToneCartridge}
            metalness={caliberProfile === '12_gauge' ? 0.48 : 0.82}
            roughness={caliberProfile === '12_gauge' ? 0.34 : 0.22}
          />
          {showEdges && <Edges threshold={36} color="#7c2d12" />}
        </mesh>
      </group>

      {/* Supersonic Projectile Motion Trail / Aerodynamic Arrow Air-Wake */}
      <mesh ref={streakMeshRef} visible={false} renderOrder={8}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color={isArcheryActive ? '#e2e8f0' : '#ea580c'}
          transparent
          opacity={isArcheryActive ? 0.28 : 0.55}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Internal Chamber Ignition Glow */}
      <mesh ref={chamberFlashRef} position={meta.chamberGlowPos} visible={false} renderOrder={9}>
        <sphereGeometry args={[0.52, 16, 12]} />
        <meshBasicMaterial
          color="#f97316"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      <pointLight
        ref={chamberLightRef}
        position={[
          meta.chamberGlowPos[0] + (isTankActive ? 4.0 : 0.3),
          meta.chamberGlowPos[1],
          meta.chamberGlowPos[2] + (isTankActive ? 16.0 : 1.15),
        ]}
        color={CHAMBER_IGNITION_LIGHT_COLOR}
        intensity={0}
        decay={2}
        distance={
          isTankActive
            ? 240
            : caliberProfile === '30x173_gau8'
              ? 75
              : is50Bmg
                ? 22
                : 16
        }
      />

      {/* 3b. Gas-Block / Piston Port Tap Impulse Glow */}
      <mesh ref={gasPortFlashRef} visible={false} renderOrder={9}>
        <sphereGeometry args={[0.48, 16, 12]} />
        <meshBasicMaterial
          color="#fb923c"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>

      {/* 3c. Bolt-Carrier Gas-Key Exhaust Vent Puff (M4A1 right-side port) */}
      <mesh ref={ventFlashRef} visible={false} renderOrder={9}>
        <sphereGeometry args={[0.5, 14, 10]} />
        <meshBasicMaterial
          ref={ventFlashMatRef}
          color={HDR_VENT}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* 4. Muzzle Blast: fireball + flame cone + Mach diamonds + device jets */}
      <group ref={muzzleGroupRef} position={meta.muzzlePos} visible={false}>
        <mesh ref={muzzleBallRef} position={[0.35, 0, 0]} renderOrder={10}>
          <sphereGeometry args={[0.6, 18, 12]} />
          <meshBasicMaterial
            ref={muzzleBallMatRef}
            color={HDR_CORE}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        <mesh
          rotation={[0, 0, -Math.PI / 2]}
          position={[is50Ae ? 1.35 : isM82Brake ? 1.25 : 1.65, 0, 0]}
          renderOrder={9}
        >
          <coneGeometry
            args={[
              is50Ae ? 1.55 : isM82Brake ? 0.85 : 1.15,
              is50Ae ? 2.8 : isM82Brake ? 2.3 : 3.4,
              20,
              1,
              true,
            ]}
          />
          <meshBasicMaterial
            ref={muzzleOuterMatRef}
            color={HDR_FLAME}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        <mesh
          rotation={[0, 0, -Math.PI / 2]}
          position={[isM82Brake ? 0.72 : 0.95, 0, 0]}
          renderOrder={10}
        >
          <coneGeometry
            args={[is50Ae ? 0.78 : isM82Brake ? 0.42 : 0.52, isM82Brake ? 1.45 : 1.95, 16]}
          />
          <meshBasicMaterial
            ref={muzzleCoreMatRef}
            color={is50Bmg || is50Ae ? HDR_CORE : HDR_JET_CORE}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>

        {/* Supersonic Mach shock diamonds (coaxial plasma core + translucent flame sheath halo) */}
        {DIAMOND_SLOTS.map((i) => (
          <React.Fragment key={`diamond-${i}`}>
            <mesh
              ref={(el) => {
                diamondMeshRefs.current[i] = el;
              }}
              position={[0.75 + i, 0, 0]}
              visible={i < diamondCount}
              renderOrder={11}
            >
              <octahedronGeometry args={[1, 0]} />
              <meshBasicMaterial
                ref={(el) => {
                  diamondMatRefs.current[i] = el;
                }}
                color={HDR_DIAMOND}
                transparent
                opacity={0}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
            <mesh
              ref={(el) => {
                diamondHaloMeshRefs.current[i] = el;
              }}
              position={[0.81 + i, 0, 0]}
              visible={i < diamondCount}
              renderOrder={10}
            >
              <octahedronGeometry args={[1, 0]} />
              <meshBasicMaterial
                ref={(el) => {
                  diamondHaloMatRefs.current[i] = el;
                }}
                color={HDR_FLAME}
                transparent
                opacity={0}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>
          </React.Fragment>
        ))}

        {/* Directional brake jets (±35° rearward-lateral) / flash-hider prongs */}
        {jets.map((jet, idx) => (
          <mesh
            key={`${activeWeaponId}-jet-${idx}`}
            geometry={jet.geometry}
            position={[jet.spec.offsetX, jet.spec.offsetY, jet.spec.offsetZ]}
            quaternion={jet.quaternion}
            renderOrder={jet.spec.layer === 0 ? 10 : 9}
          >
            <meshBasicMaterial
              ref={(el) => {
                jetMatRefs.current[idx] = el;
              }}
              color={jet.spec.layer === 0 ? HDR_JET_CORE : HDR_JET_SHEATH}
              transparent
              opacity={0}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
      <pointLight
        ref={muzzleLightRef}
        position={meta.muzzlePos}
        color="#fb923c"
        intensity={0}
        distance={isTankActive ? 380 : deviceSpec.kind === 'brake' ? 22 : 16}
      />

      {/* Primary Concussion Shock Collar */}
      <mesh
        ref={shockRingRef as React.RefObject<THREE.Mesh>}
        position={[meta.muzzlePos[0] + 0.25, meta.muzzlePos[1], meta.muzzlePos[2]]}
        rotation={[0, Math.PI / 2, 0]}
        visible={false}
        renderOrder={9}
      >
        <torusGeometry args={[0.98, is50Bmg ? 0.1 : 0.06, 12, 32]} />
        <meshBasicMaterial
          ref={shockRingMatRef}
          color={HDR_FLAME}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* Expanding blast-wave front (translucent shock shell) */}
      <mesh ref={blastRingRef} visible={false} renderOrder={8}>
        <sphereGeometry args={[1, 28, 16]} />
        <meshBasicMaterial
          ref={blastRingMatRef}
          color="#e2e8f0"
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Signature .50 AE Desert Eagle Luminous Magnum Fireball Ring */}
      <group
        ref={magnumRingRef}
        position={[meta.muzzlePos[0] + 2.2, meta.muzzlePos[1], meta.muzzlePos[2]]}
        rotation={[0, Math.PI / 2, 0]}
        visible={false}
      >
        <mesh renderOrder={9}>
          <torusGeometry args={[1.42, 0.28, 16, 36]} />
          <meshBasicMaterial
            ref={magnumRingOuterMatRef}
            color={HDR_FLAME}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh renderOrder={10}>
          <torusGeometry args={[1.42, 0.12, 14, 36]} />
          <meshBasicMaterial
            ref={magnumRingCoreMatRef}
            color={HDR_CORE}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Lingering translucent muzzle gunsmoke puff (caliber & muzzle-device coupled) */}
      {MUZZLE_PUFF_SLOTS.map((i) => (
        <mesh
          key={`muzzle-puff-${i}`}
          ref={(el) => {
            muzzlePuffMeshRefs.current[i] = el;
          }}
          geometry={muzzlePuffGeo}
          raycast={noSmokeRaycast}
          visible={false}
          renderOrder={11}
        >
          <shaderMaterial
            ref={(el) => {
              muzzlePuffMatRefs.current[i] = el;
            }}
            args={muzzlePuffShaderArgs[i]}
            transparent
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* 5. Next Complete Cartridge / Quiver Arrow (with Boxer Primer / Nock Collar) */}
      <group ref={nextRoundRef} scale={roundFit.roundScale}>
        <group ref={nextRoundInnerRef} position={[roundFit.magLocalShiftX, 0, 0]}>
          <mesh key={`next-case-${caliberProfile}`} geometry={caseGeo} renderOrder={2}>
            <meshStandardMaterial
              color={useMultiToneCartridge ? '#ffffff' : calSpec.caseColor}
              vertexColors={useMultiToneCartridge}
              metalness={
                isArcheryActive
                  ? 0.24
                  : caliberProfile === '473_caseless'
                    ? 0.08
                    : caliberProfile === '12_gauge'
                      ? 0.35
                      : 0.86
              }
              roughness={
                isArcheryActive
                  ? 0.44
                  : caliberProfile === '473_caseless'
                    ? 0.72
                    : caliberProfile === '12_gauge'
                      ? 0.42
                      : 0.21
              }
            />
            {showEdges && <Edges threshold={36} color="#854d0e" />}
          </mesh>
          <mesh key={`next-primer-${caliberProfile}`} geometry={livePrimerGeo} renderOrder={2}>
            <meshStandardMaterial
              color={calSpec.primerColor}
              metalness={isArcheryActive ? 0.42 : 0.92}
              roughness={isArcheryActive ? 0.28 : 0.17}
            />
          </mesh>
          <mesh
            key={`next-bullet-${caliberProfile}`}
            geometry={bulletGeo}
            position={[calSpec.bulletLocalOffset, 0, 0]}
            renderOrder={2}
          >
            <meshStandardMaterial
              color={useMultiToneCartridge ? '#ffffff' : calSpec.bulletColor}
              vertexColors={useMultiToneCartridge}
              metalness={caliberProfile === '12_gauge' ? 0.48 : 0.82}
              roughness={caliberProfile === '12_gauge' ? 0.34 : 0.22}
            />
            {showEdges && <Edges threshold={36} color="#7c2d12" />}
          </mesh>
        </group>
      </group>
    </group>
  );
};

function isHighMagnumCaliber(p: CaliberProfile): boolean {
  return (
    p === '50_bmg' ||
    p === '338_lapua' ||
    p === '30_06' ||
    p === '125mm_apfsds' ||
    p === '120mm_apfsds' ||
    p === '88mm_pzgr39'
  );
}
