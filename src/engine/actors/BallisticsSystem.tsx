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
  '762_m43': new THREE.Color(CALIBER_VISUAL_SPECS['762_m43'].caseColor),
  '556_nato': new THREE.Color(CALIBER_VISUAL_SPECS['556_nato'].caseColor),
  '57_28': new THREE.Color(CALIBER_VISUAL_SPECS['57_28'].caseColor),
  '338_lapua': new THREE.Color(CALIBER_VISUAL_SPECS['338_lapua'].caseColor),
  '50_bmg': new THREE.Color(CALIBER_VISUAL_SPECS['50_bmg'].caseColor),
  '50_ae': new THREE.Color(CALIBER_VISUAL_SPECS['50_ae'].caseColor),
  arrow_400gr: new THREE.Color(CALIBER_VISUAL_SPECS.arrow_400gr.caseColor),
  bolt_400gr: new THREE.Color(CALIBER_VISUAL_SPECS.bolt_400gr.caseColor),
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
const SMOKE_GREY = new THREE.Color('#a8a29e');
const SMOKE_HAZE = new THREE.Color('#cbd5e1');

const MAX_SHOCK_DIAMONDS = 5;
const DIAMOND_SLOTS = [0, 1, 2, 3, 4] as const;
const CASING_SLOTS = Array.from({ length: SPENT_CASING_POOL_SIZE }, (_, i) => i);
const SMOKE_SLOTS = Array.from({ length: SMOKE_WISP_POOL_SIZE }, (_, i) => i);

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
    const isPistol = meta.scaleProfile === 'pistol';
    const px = opts?.pivot?.[0] ?? meta.chamberGlowPos[0] - (isPistol ? 2.5 : 4.5);
    const py = opts?.pivot?.[1] ?? meta.chamberGlowPos[1] - (isPistol ? 4.5 : 5.5);
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
  const smokeMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  const smokeGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 2), []);
  const initialBundle = useMemo(() => getCaliberGeometries('9mm_para'), []);

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
      const show = w.active && w.opacity > 0.004;
      mesh.visible = show;
      if (!show) continue;
      mesh.position.set(w.px, w.py, w.pz);
      mesh.scale.set(w.size * 1.15, w.size, w.size);
      const mat = smokeMatRefs.current[i];
      if (mat) {
        mat.opacity = w.opacity;
        mat.color.copy(w.kind === 3 ? SMOKE_HAZE : SMOKE_GREY);
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
          visible={false}
          renderOrder={11}
        >
          <meshBasicMaterial
            ref={(el) => {
              smokeMatRefs.current[i] = el;
            }}
            color={SMOKE_GREY}
            transparent
            opacity={0}
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
  const isM82Brake = activeWeaponId === 'm82a1';
  const isArcheryActive = isArcheryWeapon(activeWeaponId);
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
  const jetMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const muzzleLightRef = useRef<THREE.PointLight>(null);

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
    inp.muzzleX = curMeta.muzzlePos[0] + computeMuzzleRecoilShiftX(weaponId, f);
    inp.muzzleY = curMeta.muzzlePos[1];
    inp.muzzleZ = curMeta.muzzlePos[2];
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
    const ib = evaluateInternalBallisticsInto(
      curProfile,
      f,
      _ballisticsSample,
      timing
    );

    // 1. Chambered / extracting case — handed over to the rigid-body pool at ejectF
    if (spentCaseRef.current && spentCaseMatRef.current) {
      spentCaseRef.current.visible =
        !isArchery && st.spentCaseVisible && f < timing.ejectF;
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
      bulletGroupRef.current.rotation.set(f * 42, 0, 0);
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
          st.bulletPos[0] - st.streakLength * 0.5 - 0.35,
          st.bulletPos[1] + phys.barrelWhipY,
          st.bulletPos[2]
        );
      }
    }

    // 3. Chamber ignition glow, scaled by instantaneous chamber pressure
    const p01 = ib.pressure01;
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
      const baseChamberScale =
        curProfile === '50_bmg' ? 1.25 : curProfile === '338_lapua' ? 1.05 : 0.72;
      const s = baseChamberScale + intensity * 0.75;
      chamberFlashRef.current.scale.set(s * 1.45, s, s);
      (chamberFlashRef.current.material as THREE.MeshBasicMaterial).opacity =
        intensity * 0.86;
    }

    if (chamberLightRef.current) {
      const lightBoost = curProfile === '50_bmg' ? 7.5 : 4.5;
      chamberLightRef.current.intensity = isArchery
        ? 0
        : Math.max(st.chamberFlashIntensity, p01) * lightBoost;
    }

    // 3b. Gas-block / piston port tap glow (driven by quantitative port pressure)
    const gasPort01 = isArchery
      ? 0
      : Math.min(
          1,
          ib.gasPortPressureMPa / Math.max(1, curBallistic.peakPressureMPa * 0.25)
        );
    if (gasPortFlashRef.current) {
      const gi = isArchery ? 0 : Math.max(st.gasPortFlashIntensity, gasPort01);
      const activeGas = !isArchery && gi > 0.02;
      gasPortFlashRef.current.visible = activeGas;
      if (activeGas) {
        gasPortFlashRef.current.position.set(
          st.gasPortPos[0],
          st.gasPortPos[1],
          st.gasPortPos[2]
        );
        const gs = 0.65 + gi * 0.85;
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
    const plumeOpacity = isArchery ? 0 : st.muzzlePlumeOpacity;
    const plumeActive = !isArchery && plumeOpacity > 0.02;
    const flicker = 0.86 + 0.14 * Math.sin(phys.simTimeSec * 97.0);
    if (muzzleGroupRef.current) {
      muzzleGroupRef.current.visible = plumeActive;
      if (plumeActive) {
        muzzleGroupRef.current.position.set(
          curMeta.muzzlePos[0] + muzzleShiftX,
          curMeta.muzzlePos[1] + phys.barrelWhipY,
          curMeta.muzzlePos[2]
        );
        const s = st.muzzlePlumeScale * curSpec.flashScaleMult;
        muzzleGroupRef.current.scale.setScalar(s);
        const fwd = curDevice.forwardDamp;

        if (muzzleOuterMatRef.current) {
          muzzleOuterMatRef.current.opacity = plumeOpacity * 0.5 * fwd * flicker;
        }
        if (muzzleCoreMatRef.current) {
          muzzleCoreMatRef.current.opacity = plumeOpacity * 0.85 * fwd;
        }
        if (muzzleBallRef.current && muzzleBallMatRef.current) {
          muzzleBallMatRef.current.opacity = plumeOpacity * 0.9 * flicker;
          const bs = 0.55 + 0.25 * flicker;
          muzzleBallRef.current.scale.set(bs * 1.25, bs, bs);
        }

        // Supersonic under-expanded jet: standing Mach diamonds along +X
        for (let i = 0; i < MAX_SHOCK_DIAMONDS; i++) {
          const mesh = diamondMeshRefs.current[i];
          const mat = diamondMatRefs.current[i];
          if (!mesh || !mat) continue;
          const on = i < curBallistic.shockDiamonds;
          mesh.visible = on;
          if (!on) continue;
          const spacing = 0.95 + i * 0.08;
          mesh.position.x = 0.75 + i * spacing;
          const shrink = 1 - i * 0.14;
          const pulse = 0.92 + 0.08 * Math.sin(phys.simTimeSec * 140 + i * 1.7);
          mesh.scale.set(0.42 * shrink * pulse, 0.2 * shrink, 0.2 * shrink);
          mat.opacity = plumeOpacity * (0.95 - i * 0.15) * fwd;
        }

        const jetsNow = getMuzzleJets(weaponId);
        for (let i = 0; i < jetsNow.length; i++) {
          const mat = jetMatRefs.current[i];
          if (mat) {
            mat.opacity =
              plumeOpacity *
              jetsNow[i].spec.intensity *
              (jetsNow[i].spec.layer === 0 ? 1 : flicker);
          }
        }
      }
    }

    if (muzzleLightRef.current) {
      muzzleLightRef.current.intensity = isArchery
        ? 0
        : plumeOpacity * (isHighMagnumCaliber(curProfile) ? 9 : 5);
      muzzleLightRef.current.position.set(
        curMeta.muzzlePos[0] + muzzleShiftX + 1.2,
        curMeta.muzzlePos[1] + phys.barrelWhipY,
        curMeta.muzzlePos[2] + 0.6
      );
    }

    // 4b. Primary shock collar at the crown
    if (shockRingRef.current && shockRingMatRef.current) {
      shockRingRef.current.visible = plumeActive;
      if (plumeActive) {
        shockRingRef.current.position.set(
          curMeta.muzzlePos[0] + 0.25 + muzzleShiftX,
          curMeta.muzzlePos[1] + phys.barrelWhipY,
          curMeta.muzzlePos[2]
        );
        const ringBoost =
          curProfile === '50_bmg'
            ? 2.45
            : curProfile === '50_ae'
              ? 2.05
              : curProfile === '338_lapua'
                ? 1.85
                : 1.5;
        const rs = st.muzzlePlumeScale * ringBoost;
        shockRingRef.current.scale.set(rs, rs, rs);
        shockRingMatRef.current.opacity = plumeOpacity * 0.62;
      }
    }

    // 4c. Expanding spherical blast-wave front (Mach disk → acoustic shock)
    if (blastRingRef.current && blastRingMatRef.current) {
      const u = (f - timing.muzzleExitF) / 0.1;
      const on = !isArchery && u > 0 && u < 1;
      blastRingRef.current.visible = on;
      if (on) {
        const energyScale = Math.cbrt(curBallistic.muzzleEnergyJ / 1500);
        const rad = (0.6 + 7.5 * Math.sqrt(u)) * energyScale;
        blastRingRef.current.position.set(
          curMeta.muzzlePos[0] + muzzleShiftX + rad * 0.35,
          curMeta.muzzlePos[1],
          curMeta.muzzlePos[2]
        );
        blastRingRef.current.scale.setScalar(rad);
        blastRingMatRef.current.opacity = (1 - u) * (1 - u) * 0.38;
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

    // 5. Magazine / Quiver feed round (Slot 0; reserve stack rendered by MagazineAmmoStack)
    // Delay hiding archery handoff round until f >= 0.70 so lift33 `rotT` (0.60) & r500 `yLift/xSlide` (0.62/0.68) complete cleanly
    if (nextRoundRef.current) {
      nextRoundRef.current.visible = !isArchery || f < 0.7;
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
        <mesh geometry={caseGeo} renderOrder={2}>
          <meshStandardMaterial
            ref={spentCaseMatRef}
            color={calSpec.caseColor}
            metalness={0.86}
            roughness={0.21}
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
            color={isArcheryActive ? '#ffffff' : calSpec.bulletColor}
            vertexColors={isArcheryActive}
            metalness={0.82}
            roughness={0.22}
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
        position={[meta.chamberGlowPos[0] + 0.2, meta.chamberGlowPos[1], 0.6]}
        color="#f97316"
        intensity={0}
        distance={14}
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

        {/* Supersonic Mach shock diamonds (barrel-stretched octahedra) */}
        {DIAMOND_SLOTS.map((i) => (
          <mesh
            key={`diamond-${i}`}
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
        distance={deviceSpec.kind === 'brake' ? 22 : 16}
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

      {/* 5. Next Complete Cartridge / Quiver Arrow (with Boxer Primer / Nock Collar) */}
      <group ref={nextRoundRef} scale={roundFit.roundScale}>
        <group ref={nextRoundInnerRef} position={[roundFit.magLocalShiftX, 0, 0]}>
          <mesh key={`next-case-${caliberProfile}`} geometry={caseGeo} renderOrder={2}>
            <meshStandardMaterial
              color={isArcheryActive ? '#ffffff' : calSpec.caseColor}
              vertexColors={isArcheryActive}
              metalness={isArcheryActive ? 0.24 : 0.86}
              roughness={isArcheryActive ? 0.44 : 0.21}
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
              color={isArcheryActive ? '#ffffff' : calSpec.bulletColor}
              vertexColors={isArcheryActive}
              metalness={0.82}
              roughness={0.22}
            />
            {showEdges && <Edges threshold={36} color="#7c2d12" />}
          </mesh>
        </group>
      </group>
    </group>
  );
};

function isHighMagnumCaliber(p: CaliberProfile): boolean {
  return p === '50_bmg' || p === '338_lapua';
}
