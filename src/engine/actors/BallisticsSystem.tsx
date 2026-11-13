import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { getLoadedWeaponPlugin } from '../../weapons/registry';
import type { CaliberProfile, WeaponId } from '../../weapons/types';
import { playbackClock } from '../clock/playbackClock';

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

interface CaliberGeometryBundle {
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

interface CaliberVisualSpec {
  caseColor: string;
  reserveCaseColor: string;
  bulletColor: string;
  primerColor: string;
  bulletLocalOffset: number;
  reserveTiltZ: number;
  flashScaleMult: number;
  streakThickness: number;
}

const CALIBER_VISUAL_SPECS: Record<CaliberProfile, CaliberVisualSpec> = {
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
};

interface WeaponRoundFitSpec {
  roundScale: number;
  magLocalShiftX: number;
  ignitionF: number;
}

/**
 * Static zero-allocation per-weapon fit & primer-strike timing lookup table.
 * Verified against every weapon's magazine cavity, feed lips, chamber, and ejection port!
 */
const WEAPON_ROUND_FIT: Record<WeaponId, WeaponRoundFitSpec> = {
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
};

const caliberGeoCache = new Map<CaliberProfile, CaliberGeometryBundle>();

function getCaliberGeometries(profile: CaliberProfile): CaliberGeometryBundle {
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

const BRAKE_SIDES = [1, -1] as const;

export const BallisticsSystem: React.FC = () => {
  const mode = useAppStore((s) => s.mode);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const showEdges = useAppStore((s) => s.showEdges);

  const manifest = getWeaponManifest(activeWeaponId);
  const caliberProfile = manifest.caliberProfile;
  const meta = manifest.workbenchMeta;
  const calSpec = CALIBER_VISUAL_SPECS[caliberProfile];
  const roundFit = WEAPON_ROUND_FIT[activeWeaponId];

  const {
    caseGeo,
    bulletGeo,
    livePrimerGeo,
    spentPrimerGeo,
    sootRingGeo,
    craterSootGeo,
  } = useMemo(() => getCaliberGeometries(caliberProfile), [caliberProfile]);

  const isM82Brake = activeWeaponId === 'm82a1';
  const isAwmBrake = activeWeaponId === 'awm';
  const isAk15Brake = activeWeaponId === 'ak15';
  const is50Bmg = caliberProfile === '50_bmg';
  const is50Ae = caliberProfile === '50_ae';

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

  const muzzleGroupRef = useRef<THREE.Group>(null);
  const muzzleOuterMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const muzzleCoreMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const brakeOuterMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const brakeSecondaryMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const brakeCoreMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  const shockRingRef = useRef<THREE.Mesh>(null);
  const shockRingMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const magnumRingRef = useRef<THREE.Group>(null);
  const magnumRingOuterMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const magnumRingCoreMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const nextRoundRef = useRef<THREE.Group>(null);
  const nextRoundInnerRef = useRef<THREE.Group>(null);
  const reserveRoundRef = useRef<THREE.Group>(null);
  const reserveRoundInnerRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const state = useAppStore.getState();
    if (state.mode !== 'firing') return;

    const weaponId = state.activeWeaponId;
    const plugin = getLoadedWeaponPlugin(weaponId);
    if (!plugin) return;

    const f = playbackClock.getState().animatedFireProgress;
    const curManifest = getWeaponManifest(weaponId);
    const curProfile = curManifest.caliberProfile;
    const curMeta = curManifest.workbenchMeta;
    const curSpec = CALIBER_VISUAL_SPECS[curProfile];
    const curFit = WEAPON_ROUND_FIT[weaponId];
    const st = plugin.computeBallisticsState(f);
    const muzzleShiftX = computeMuzzleRecoilShiftX(weaponId, f);

    if (spentCaseRef.current && spentCaseMatRef.current) {
      spentCaseRef.current.visible = st.spentCaseVisible;
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

    if (bulletGroupRef.current) {
      bulletGroupRef.current.visible = st.bulletVisible;
      bulletGroupRef.current.position.set(
        st.bulletPos[0],
        st.bulletPos[1],
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
          st.bulletPos[1],
          st.bulletPos[2]
        );
      }
    }

    if (chamberFlashRef.current) {
      chamberFlashRef.current.visible = st.chamberFlashIntensity > 0.02;
      chamberFlashRef.current.position.set(
        curMeta.chamberGlowPos[0] + muzzleShiftX * 0.65,
        curMeta.chamberGlowPos[1],
        curMeta.chamberGlowPos[2]
      );
      const baseChamberScale =
        curProfile === '50_bmg'
          ? 1.25
          : curProfile === '338_lapua'
            ? 1.05
            : 0.72;
      const s = baseChamberScale + st.chamberFlashIntensity * 0.75;
      chamberFlashRef.current.scale.set(s * 1.45, s, s);
      (chamberFlashRef.current.material as THREE.MeshBasicMaterial).opacity =
        st.chamberFlashIntensity * 0.86;
    }

    if (chamberLightRef.current) {
      const lightBoost = curProfile === '50_bmg' ? 7.5 : 4.5;
      chamberLightRef.current.intensity = st.chamberFlashIntensity * lightBoost;
    }

    if (gasPortFlashRef.current) {
      const activeGas = st.gasPortFlashIntensity > 0.02;
      gasPortFlashRef.current.visible = activeGas;
      if (activeGas) {
        gasPortFlashRef.current.position.set(
          st.gasPortPos[0],
          st.gasPortPos[1],
          st.gasPortPos[2]
        );
        const gs = 0.65 + st.gasPortFlashIntensity * 0.85;
        gasPortFlashRef.current.scale.set(gs * 1.6, gs, gs);
        (gasPortFlashRef.current.material as THREE.MeshBasicMaterial).opacity =
          st.gasPortFlashIntensity * 0.85;
      }
    }

    if (
      muzzleGroupRef.current &&
      muzzleOuterMatRef.current &&
      muzzleCoreMatRef.current
    ) {
      const active = st.muzzlePlumeOpacity > 0.02;
      muzzleGroupRef.current.visible = active;
      if (active) {
        muzzleGroupRef.current.position.set(
          curMeta.muzzlePos[0] + muzzleShiftX,
          curMeta.muzzlePos[1],
          curMeta.muzzlePos[2]
        );
        const s = st.muzzlePlumeScale * curSpec.flashScaleMult;
        muzzleGroupRef.current.scale.set(s * 1.3, s, s);
        const forwardDamp = weaponId === 'm82a1' ? 0.68 : 1.0;
        muzzleOuterMatRef.current.opacity =
          st.muzzlePlumeOpacity * 0.56 * forwardDamp;
        muzzleCoreMatRef.current.opacity =
          st.muzzlePlumeOpacity * 0.9 * forwardDamp;

        const outerOpacity = st.muzzlePlumeOpacity * 0.68;
        const outerList = brakeOuterMatRefs.current;
        for (let i = 0; i < outerList.length; i++) {
          const mat = outerList[i];
          if (mat) mat.opacity = outerOpacity;
        }
        const secOpacity = st.muzzlePlumeOpacity * 0.54;
        const secList = brakeSecondaryMatRefs.current;
        for (let i = 0; i < secList.length; i++) {
          const mat = secList[i];
          if (mat) mat.opacity = secOpacity;
        }
        const coreOpacity = st.muzzlePlumeOpacity * 0.92;
        const coreList = brakeCoreMatRefs.current;
        for (let i = 0; i < coreList.length; i++) {
          const mat = coreList[i];
          if (mat) mat.opacity = coreOpacity;
        }
      }
    }

    if (shockRingRef.current && shockRingMatRef.current) {
      const active = st.muzzlePlumeOpacity > 0.02;
      shockRingRef.current.visible = active;
      if (active) {
        shockRingRef.current.position.set(
          curMeta.muzzlePos[0] + 0.25 + muzzleShiftX,
          curMeta.muzzlePos[1],
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
        shockRingMatRef.current.opacity = st.muzzlePlumeOpacity * 0.68;
      }
    }

    if (
      magnumRingRef.current &&
      magnumRingOuterMatRef.current &&
      magnumRingCoreMatRef.current
    ) {
      const activeMagnum =
        curProfile === '50_ae' && st.muzzlePlumeOpacity > 0.02;
      magnumRingRef.current.visible = activeMagnum;
      if (activeMagnum) {
        const ms = 0.85 + st.muzzlePlumeScale * 1.45;
        magnumRingRef.current.position.set(
          curMeta.muzzlePos[0] + 1.4 + st.muzzlePlumeScale * 1.65,
          curMeta.muzzlePos[1],
          curMeta.muzzlePos[2]
        );
        magnumRingRef.current.scale.set(ms * 0.85, ms, ms);
        magnumRingOuterMatRef.current.opacity = st.muzzlePlumeOpacity * 0.78;
        magnumRingCoreMatRef.current.opacity = st.muzzlePlumeOpacity * 0.95;
      }
    }

    if (nextRoundRef.current) {
      nextRoundRef.current.position.set(
        st.nextRoundPos[0],
        st.nextRoundPos[1],
        st.nextRoundPos[2]
      );
      nextRoundRef.current.rotation.set(
        0,
        st.nextRoundRotY ?? 0,
        st.nextRoundRotZ
      );
      nextRoundRef.current.scale.setScalar(curFit.roundScale);
    }
    if (nextRoundInnerRef.current) {
      const uFeed = THREE.MathUtils.clamp((f - 0.58) / 0.24, 0, 1);
      const feedBlend = uFeed * uFeed * (3 - 2 * uFeed);
      nextRoundInnerRef.current.position.x =
        curFit.magLocalShiftX * (1 - feedBlend);
    }
    if (reserveRoundRef.current) {
      reserveRoundRef.current.position.set(
        st.reserveRoundPos[0],
        st.reserveRoundPos[1],
        st.reserveRoundPos[2]
      );
      reserveRoundRef.current.rotation.set(
        0,
        st.reserveRoundRotY ?? 0,
        curSpec.reserveTiltZ
      );
      reserveRoundRef.current.scale.setScalar(curFit.roundScale);
    }
    if (reserveRoundInnerRef.current) {
      reserveRoundInnerRef.current.position.x = curFit.magLocalShiftX;
    }
  });

  if (mode !== 'firing') return null;

  return (
    <group>
      {/* 1. Chambered / Extracted / Ejected Brass Case + Live/Struck Boxer Primer */}
      <group
        ref={spentCaseRef}
        position={meta.chamberGlowPos}
        scale={roundFit.roundScale}
      >
        <mesh geometry={caseGeo} renderOrder={2}>
          <meshStandardMaterial
            ref={spentCaseMatRef}
            color={calSpec.caseColor}
            metalness={0.86}
            roughness={0.21}
          />
          {showEdges && <Edges threshold={36} color="#854d0e" />}
        </mesh>

        {/* Un-struck Nickel Boxer Primer Cup (visible before firing-pin strike) */}
        <mesh
          ref={chamberLivePrimerRef}
          geometry={livePrimerGeo}
          renderOrder={2}
        >
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
      <group
        ref={bulletGroupRef}
        position={meta.chamberGlowPos}
        scale={roundFit.roundScale}
      >
        <mesh geometry={bulletGeo} renderOrder={2}>
          <meshStandardMaterial
            color={calSpec.bulletColor}
            metalness={0.82}
            roughness={0.22}
          />
          {showEdges && <Edges threshold={36} color="#7c2d12" />}
        </mesh>
      </group>

      {/* Supersonic Projectile Motion Trail */}
      <mesh ref={streakMeshRef} visible={false} renderOrder={8}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color="#ea580c"
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Internal Chamber Ignition Glow */}
      <mesh
        ref={chamberFlashRef}
        position={meta.chamberGlowPos}
        visible={false}
        renderOrder={9}
      >
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

      {/* 4. Caliber-Specific Muzzle Gas Plume & Directional Rifle Brake Lobes */}
      <group ref={muzzleGroupRef} position={meta.muzzlePos} visible={false}>
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
            color="#f59e0b"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        <mesh
          rotation={[0, 0, -Math.PI / 2]}
          position={[isM82Brake ? 0.72 : 0.95, 0, 0]}
          renderOrder={9}
        >
          <coneGeometry
            args={[
              is50Ae ? 0.78 : isM82Brake ? 0.42 : 0.52,
              isM82Brake ? 1.45 : 1.95,
              16,
            ]}
          />
          <meshBasicMaterial
            ref={muzzleCoreMatRef}
            color={is50Bmg || is50Ae ? '#fef08a' : '#ea580c'}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>

        {/* Barrett M82A1 2-Chamber 33° Rearward-Swept Arrowhead Brake Twin Chevron Blast */}
        {isM82Brake && (
          <>
            {BRAKE_SIDES.map((side, idx) => (
              <group key={`m82-brake-${side}`}>
                {/* Chamber 1 Primary Rearward-Swept Gas Wing */}
                <group
                  position={[-0.95, 0, side * 0.44]}
                  rotation={[0, side * -0.58, 0]}
                >
                  <mesh
                    rotation={[side * (Math.PI / 2), 0, 0]}
                    position={[0, 0, side * 2.45]}
                    renderOrder={9}
                  >
                    <coneGeometry args={[1.22, 4.85, 18, 1, true]} />
                    <meshBasicMaterial
                      ref={(el) => {
                        brakeOuterMatRefs.current[idx] = el;
                      }}
                      color="#f97316"
                      transparent
                      opacity={0}
                      side={THREE.DoubleSide}
                      depthWrite={false}
                    />
                  </mesh>
                  <mesh
                    rotation={[side * (Math.PI / 2), 0, 0]}
                    position={[0, 0, side * 1.45]}
                    renderOrder={9}
                  >
                    <coneGeometry args={[0.56, 2.85, 14]} />
                    <meshBasicMaterial
                      ref={(el) => {
                        brakeCoreMatRefs.current[idx * 2] = el;
                      }}
                      color="#fef3c7"
                      transparent
                      opacity={0}
                      depthWrite={false}
                    />
                  </mesh>
                </group>

                {/* Chamber 2 Secondary Rearward-Swept Gas Wing */}
                <group
                  position={[-0.28, 0, side * 0.38]}
                  rotation={[0, side * -0.56, 0]}
                >
                  <mesh
                    rotation={[side * (Math.PI / 2), 0, 0]}
                    position={[0, 0, side * 1.85]}
                    renderOrder={9}
                  >
                    <coneGeometry args={[0.92, 3.65, 16, 1, true]} />
                    <meshBasicMaterial
                      ref={(el) => {
                        brakeSecondaryMatRefs.current[idx] = el;
                      }}
                      color="#fb923c"
                      transparent
                      opacity={0}
                      side={THREE.DoubleSide}
                      depthWrite={false}
                    />
                  </mesh>
                  <mesh
                    rotation={[side * (Math.PI / 2), 0, 0]}
                    position={[0, 0, side * 1.05]}
                    renderOrder={9}
                  >
                    <coneGeometry args={[0.4, 2.05, 12]} />
                    <meshBasicMaterial
                      ref={(el) => {
                        brakeCoreMatRefs.current[idx * 2 + 1] = el;
                      }}
                      color="#fef3c7"
                      transparent
                      opacity={0}
                      depthWrite={false}
                    />
                  </mesh>
                </group>
              </group>
            ))}
          </>
        )}

        {/* Accuracy International AWM 2-Chamber Lateral Flat Tactical Brake Lobes */}
        {isAwmBrake && (
          <>
            {BRAKE_SIDES.map((side, idx) => (
              <group key={`awm-brake-${side}`}>
                <group
                  position={[-0.55, 0, side * 0.26]}
                  rotation={[0, side * -0.28, 0]}
                >
                  <mesh
                    rotation={[side * (Math.PI / 2), 0, 0]}
                    position={[0, 0, side * 1.42]}
                    renderOrder={9}
                  >
                    <coneGeometry args={[0.68, 2.8, 16, 1, true]} />
                    <meshBasicMaterial
                      ref={(el) => {
                        brakeOuterMatRefs.current[idx] = el;
                      }}
                      color="#f59e0b"
                      transparent
                      opacity={0}
                      side={THREE.DoubleSide}
                      depthWrite={false}
                    />
                  </mesh>
                  <mesh
                    rotation={[side * (Math.PI / 2), 0, 0]}
                    position={[0, 0, side * 0.85]}
                    renderOrder={9}
                  >
                    <coneGeometry args={[0.32, 1.65, 12]} />
                    <meshBasicMaterial
                      ref={(el) => {
                        brakeCoreMatRefs.current[idx] = el;
                      }}
                      color="#fde68a"
                      transparent
                      opacity={0}
                      depthWrite={false}
                    />
                  </mesh>
                </group>
                <group
                  position={[-0.14, 0, side * 0.24]}
                  rotation={[0, side * -0.22, 0]}
                >
                  <mesh
                    rotation={[side * (Math.PI / 2), 0, 0]}
                    position={[0, 0, side * 1.02]}
                    renderOrder={9}
                  >
                    <coneGeometry args={[0.48, 1.95, 14, 1, true]} />
                    <meshBasicMaterial
                      ref={(el) => {
                        brakeSecondaryMatRefs.current[idx] = el;
                      }}
                      color="#fb923c"
                      transparent
                      opacity={0}
                      side={THREE.DoubleSide}
                      depthWrite={false}
                    />
                  </mesh>
                </group>
              </group>
            ))}
          </>
        )}

        {/* Kalashnikov AK-15 6P71M Slotted Brake Side Jets & Anti-Climb Top-Right Vent */}
        {isAk15Brake && (
          <>
            {BRAKE_SIDES.map((side, idx) => (
              <group
                key={`ak15-brake-${side}`}
                position={[-0.48, 0, side * 0.22]}
                rotation={[0, side * -0.15, 0]}
              >
                <mesh
                  rotation={[side * (Math.PI / 2), 0, 0]}
                  position={[0, 0, side * 1.08]}
                  renderOrder={9}
                >
                  <coneGeometry args={[0.52, 2.15, 14, 1, true]} />
                  <meshBasicMaterial
                    ref={(el) => {
                      brakeOuterMatRefs.current[idx] = el;
                    }}
                    color="#f97316"
                    transparent
                    opacity={0}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                  />
                </mesh>
                <mesh
                  rotation={[side * (Math.PI / 2), 0, 0]}
                  position={[0, 0, side * 0.65]}
                  renderOrder={9}
                >
                  <coneGeometry args={[0.24, 1.25, 12]} />
                  <meshBasicMaterial
                    ref={(el) => {
                      brakeCoreMatRefs.current[idx] = el;
                    }}
                    color="#fef08a"
                    transparent
                    opacity={0}
                    depthWrite={false}
                  />
                </mesh>
              </group>
            ))}
            {/* Asymmetric 6P71M upward-right compensator port jet countering muzzle climb */}
            <group position={[-0.82, 0.2, 0.12]} rotation={[-0.42, 0, -0.16]}>
              <mesh position={[0, 0.72, 0]} renderOrder={9}>
                <coneGeometry args={[0.34, 1.42, 12, 1, true]} />
                <meshBasicMaterial
                  ref={(el) => {
                    brakeSecondaryMatRefs.current[2] = el;
                  }}
                  color="#fb923c"
                  transparent
                  opacity={0}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            </group>
          </>
        )}
      </group>

      {/* Primary Concussion Shockwave Ring */}
      <mesh
        ref={shockRingRef}
        position={[
          meta.muzzlePos[0] + 0.25,
          meta.muzzlePos[1],
          meta.muzzlePos[2],
        ]}
        rotation={[0, Math.PI / 2, 0]}
        visible={false}
        renderOrder={9}
      >
        <torusGeometry args={[0.98, is50Bmg ? 0.1 : 0.06, 12, 32]} />
        <meshBasicMaterial
          ref={shockRingMatRef}
          color="#f97316"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>

      {/* Signature .50 AE Desert Eagle Luminous Magnum Fireball Ring */}
      <group
        ref={magnumRingRef}
        position={[
          meta.muzzlePos[0] + 2.2,
          meta.muzzlePos[1],
          meta.muzzlePos[2],
        ]}
        rotation={[0, Math.PI / 2, 0]}
        visible={false}
      >
        <mesh renderOrder={9}>
          <torusGeometry args={[1.42, 0.28, 16, 36]} />
          <meshBasicMaterial
            ref={magnumRingOuterMatRef}
            color="#f97316"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
        <mesh renderOrder={10}>
          <torusGeometry args={[1.42, 0.12, 14, 36]} />
          <meshBasicMaterial
            ref={magnumRingCoreMatRef}
            color="#fef08a"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* 5. Next Complete Cartridge in Magazine (with Nickel Boxer Primer Cup) */}
      <group ref={nextRoundRef} scale={roundFit.roundScale}>
        <group
          ref={nextRoundInnerRef}
          position={[roundFit.magLocalShiftX, 0, 0]}
        >
          <mesh geometry={caseGeo} renderOrder={2}>
            <meshStandardMaterial
              color={calSpec.caseColor}
              metalness={0.86}
              roughness={0.21}
            />
            {showEdges && <Edges threshold={36} color="#854d0e" />}
          </mesh>
          <mesh geometry={livePrimerGeo} renderOrder={2}>
            <meshStandardMaterial
              color={calSpec.primerColor}
              metalness={0.92}
              roughness={0.17}
            />
          </mesh>
          <mesh
            geometry={bulletGeo}
            position={[calSpec.bulletLocalOffset, 0, 0]}
            renderOrder={2}
          >
            <meshStandardMaterial
              color={calSpec.bulletColor}
              metalness={0.82}
              roughness={0.22}
            />
            {showEdges && <Edges threshold={36} color="#7c2d12" />}
          </mesh>
        </group>
      </group>

      {/* 6. Reserve Cartridge below in Magazine Stack (with Nickel Boxer Primer Cup) */}
      <group ref={reserveRoundRef} scale={roundFit.roundScale}>
        <group
          ref={reserveRoundInnerRef}
          position={[roundFit.magLocalShiftX, 0, 0]}
        >
          <mesh geometry={caseGeo} renderOrder={2}>
            <meshStandardMaterial
              color={calSpec.reserveCaseColor}
              metalness={0.82}
              roughness={0.26}
            />
          </mesh>
          <mesh geometry={livePrimerGeo} renderOrder={2}>
            <meshStandardMaterial
              color="#cbd5e1"
              metalness={0.88}
              roughness={0.22}
            />
          </mesh>
          <mesh
            geometry={bulletGeo}
            position={[calSpec.bulletLocalOffset, 0, 0]}
            renderOrder={2}
          >
            <meshStandardMaterial
              color="#9a3412"
              metalness={0.78}
              roughness={0.26}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
};
