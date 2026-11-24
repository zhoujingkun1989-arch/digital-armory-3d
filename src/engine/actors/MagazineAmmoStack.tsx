import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { getLoadedWeaponPlugin, useWeaponPlugin } from '../../weapons/registry';
import type { CaliberProfile, WeaponId, WeaponPartSpec } from '../../weapons/types';
import {
  MAGAZINE_STACK_SPECS,
  MAX_MAGAZINE_STACK_INSTANCES,
  computeMagazineFeedShift,
  computeMagazineReplenishAlpha,
  createMutableMagazineRoundPose,
  evaluateMagazineRoundSlotInto,
} from '../ballistics/magazineStackSpecs';
import { playbackClock } from '../clock/playbackClock';
import { fieldStripStore } from '../fieldstrip/fieldStripStore';
import { isArcheryCaliber } from '../physics/armoryPhysics';
import {
  clamp01,
  createMutablePose,
  evaluatePartPoseInto,
  smoothstep01,
} from '../kinematics/math';
import { malfunctionStore } from '../malfunctions/malfunctionStore';
import {
  CALIBER_VISUAL_SPECS,
  WEAPON_ROUND_FIT,
  getCaliberGeometries,
} from './BallisticsSystem';

// ============================================================================
// High-Detail Cutaway Magazine Cartridge Lathe Builder & PBR Metallurgy
// ============================================================================

export interface DetailedMagazineCartridgeGeometries {
  readonly caseGeo: THREE.BufferGeometry;
  readonly livePrimerGeo: THREE.BufferGeometry;
  readonly bulletGeo: THREE.BufferGeometry;
  readonly hasCaseVertexColors: boolean;
  readonly hasBulletVertexColors: boolean;
  readonly hasExtractorGrooveDetail: boolean;
  readonly hasRecessedPrimerPocket: boolean;
  readonly dispose: () => void;
}

export interface MagazineCartridgeMaterialPreset {
  readonly caseColor: string;
  readonly caseMetalness: number;
  readonly caseRoughness: number;
  readonly caseClearcoat: number;
  readonly caseClearcoatRoughness: number;
  readonly caseEnvMapIntensity: number;
  readonly primerColor: string;
  readonly primerMetalness: number;
  readonly primerRoughness: number;
  readonly primerClearcoat: number;
  readonly primerEnvMapIntensity: number;
  readonly bulletColor: string;
  readonly bulletMetalness: number;
  readonly bulletRoughness: number;
  readonly bulletClearcoat: number;
  readonly bulletEnvMapIntensity: number;
}

interface CutawayCartridgeProfileSpec {
  readonly xHead: number;
  readonly xMouth: number;
  readonly rPocket: number;
  readonly pocketDepth: number;
  readonly rRim: number;
  readonly rimBevel: number;
  readonly xRimEnd: number;
  readonly rGroove: number;
  readonly xGrooveRear: number;
  readonly xGrooveFront: number;
  readonly rBase: number;
  readonly xWeb: number;
  /** Optional bottleneck shoulder stations; omitted for straight/tapered pistol cases */
  readonly shoulder?: {
    readonly rBodyTop: number;
    readonly xShoulderStart: number;
    readonly rNeck: number;
    readonly xShoulderEnd: number;
  };
  readonly rMouthOuter: number;
  readonly rMouthInner: number;
  readonly xCavityFloor: number;
  readonly bulletStations: readonly (readonly [number, number])[];
}

const CUTAWAY_METALLIC_PROFILES: Partial<
  Record<CaliberProfile, CutawayCartridgeProfileSpec>
> = {
  '9mm_para': {
    xHead: -0.78,
    xMouth: 0.78,
    rPocket: 0.178,
    pocketDepth: 0.088,
    rRim: 0.406,
    rimBevel: 0.022,
    xRimEnd: -0.682,
    rGroove: 0.338,
    xGrooveRear: -0.652,
    xGrooveFront: -0.562,
    rBase: 0.405,
    xWeb: -0.504,
    rMouthOuter: 0.393,
    rMouthInner: 0.368,
    xCavityFloor: -0.36,
    bulletStations: [
      [0, -0.88],
      [0.348, -0.88],
      [0.368, -0.83],
      [0.368, -0.555],
      [0.361, -0.54],
      [0.365, -0.52],
      [0.361, -0.44],
      [0.345, -0.26],
      [0.311, -0.08],
      [0.256, 0.08],
      [0.182, 0.21],
      [0.095, 0.29],
      [0, 0.32],
    ],
  },
  '45_acp': {
    xHead: -0.92,
    xMouth: 0.92,
    rPocket: 0.212,
    pocketDepth: 0.094,
    rRim: 0.488,
    rimBevel: 0.024,
    xRimEnd: -0.82,
    rGroove: 0.408,
    xGrooveRear: -0.788,
    xGrooveFront: -0.688,
    rBase: 0.484,
    xWeb: -0.624,
    rMouthOuter: 0.48,
    rMouthInner: 0.459,
    xCavityFloor: -0.45,
    bulletStations: [
      [0, -0.88],
      [0.44, -0.88],
      [0.459, -0.82],
      [0.459, -0.445],
      [0.451, -0.43],
      [0.456, -0.41],
      [0.451, -0.3],
      [0.427, -0.12],
      [0.382, 0.05],
      [0.308, 0.19],
      [0.205, 0.285],
      [0.095, 0.33],
      [0, 0.34],
    ],
  },
  '50_ae': {
    // Authentic SAAMI rebated rim: rRim (0.472) < rBase (0.502)
    xHead: -1.18,
    xMouth: 1.18,
    rPocket: 0.194,
    pocketDepth: 0.102,
    rRim: 0.472,
    rimBevel: 0.024,
    xRimEnd: -1.06,
    rGroove: 0.398,
    xGrooveRear: -1.028,
    xGrooveFront: -0.914,
    rBase: 0.502,
    xWeb: -0.834,
    rMouthOuter: 0.496,
    rMouthInner: 0.459,
    xCavityFloor: -0.35,
    bulletStations: [
      [0, -0.84],
      [0.442, -0.84],
      [0.459, -0.78],
      [0.459, -0.405],
      [0.449, -0.39],
      [0.456, -0.37],
      [0.432, -0.22],
      [0.378, -0.02],
      [0.305, 0.16],
      [0.268, 0.2],
      [0.205, 0.195],
      [0.145, 0.04],
      [0, -0.02],
    ],
  },
  '762_m43': {
    xHead: -1.1,
    xMouth: 1.1,
    rPocket: 0.152,
    pocketDepth: 0.096,
    rRim: 0.323,
    rimBevel: 0.022,
    xRimEnd: -1.005,
    rGroove: 0.269,
    xGrooveRear: -0.978,
    xGrooveFront: -0.895,
    rBase: 0.323,
    xWeb: -0.84,
    shoulder: {
      rBodyTop: 0.285,
      xShoulderStart: 0.62,
      rNeck: 0.244,
      xShoulderEnd: 0.76,
    },
    rMouthOuter: 0.243,
    rMouthInner: 0.224,
    xCavityFloor: 0.56,
    bulletStations: [
      [0, -1.16],
      [0.182, -1.16],
      [0.224, -1.01],
      [0.224, -0.77],
      [0.212, -0.75],
      [0.223, -0.72],
      [0.214, -0.54],
      [0.188, -0.32],
      [0.146, -0.1],
      [0.092, 0.08],
      [0.036, 0.195],
      [0, 0.23],
    ],
  },
  '556_nato': {
    xHead: -1.22,
    xMouth: 1.22,
    rPocket: 0.122,
    pocketDepth: 0.092,
    rRim: 0.262,
    rimBevel: 0.019,
    xRimEnd: -1.132,
    rGroove: 0.222,
    xGrooveRear: -1.106,
    xGrooveFront: -1.022,
    rBase: 0.261,
    xWeb: -0.972,
    shoulder: {
      rBodyTop: 0.246,
      xShoulderStart: 0.77,
      rNeck: 0.175,
      xShoulderEnd: 0.94,
    },
    rMouthOuter: 0.174,
    rMouthInner: 0.156,
    xCavityFloor: 0.72,
    bulletStations: [
      [0, -1.16],
      [0.124, -1.16],
      [0.156, -1.01],
      [0.156, -0.78],
      [0.146, -0.76],
      [0.155, -0.73],
      [0.148, -0.58],
      [0.128, -0.4],
      [0.095, -0.24],
      [0.052, -0.12],
      [0.018, -0.072],
      [0, -0.06],
    ],
  },
  '57_28': {
    xHead: -0.96,
    xMouth: 0.96,
    rPocket: 0.114,
    pocketDepth: 0.082,
    rRim: 0.236,
    rimBevel: 0.018,
    xRimEnd: -0.874,
    rGroove: 0.195,
    xGrooveRear: -0.848,
    xGrooveFront: -0.768,
    rBase: 0.238,
    xWeb: -0.718,
    shoulder: {
      rBodyTop: 0.234,
      xShoulderStart: 0.58,
      rNeck: 0.172,
      xShoulderEnd: 0.71,
    },
    rMouthOuter: 0.171,
    rMouthInner: 0.154,
    xCavityFloor: 0.54,
    bulletStations: [
      [0, -0.92],
      [0.124, -0.92],
      [0.154, -0.78],
      [0.154, -0.52],
      [0.146, -0.36],
      [0.126, -0.18],
      [0.094, 0.0],
      [0.054, 0.14],
      [0.018, 0.232],
      [0, 0.25],
    ],
  },
  '338_lapua': {
    xHead: -1.62,
    xMouth: 1.68,
    rPocket: 0.134,
    pocketDepth: 0.106,
    rRim: 0.362,
    rimBevel: 0.024,
    xRimEnd: -1.5,
    rGroove: 0.308,
    xGrooveRear: -1.462,
    xGrooveFront: -1.345,
    rBase: 0.361,
    xWeb: -1.28,
    shoulder: {
      rBodyTop: 0.335,
      xShoulderStart: 1.02,
      rNeck: 0.239,
      xShoulderEnd: 1.284,
    },
    rMouthOuter: 0.238,
    rMouthInner: 0.21,
    xCavityFloor: 0.98,
    bulletStations: [
      [0, -1.38],
      [0.162, -1.38],
      [0.21, -1.16],
      [0.21, -1.07],
      [0.204, -0.88],
      [0.184, -0.62],
      [0.15, -0.34],
      [0.105, -0.08],
      [0.052, 0.1],
      [0.016, 0.165],
      [0, 0.18],
    ],
  },
  '50_bmg': {
    xHead: -2.25,
    xMouth: 2.25,
    rPocket: 0.184,
    pocketDepth: 0.136,
    rRim: 0.463,
    rimBevel: 0.03,
    xRimEnd: -2.095,
    rGroove: 0.394,
    xGrooveRear: -2.045,
    xGrooveFront: -1.875,
    rBase: 0.463,
    xWeb: -1.79,
    shoulder: {
      rBodyTop: 0.427,
      xShoulderStart: 1.29,
      rNeck: 0.319,
      xShoulderEnd: 1.67,
    },
    rMouthOuter: 0.317,
    rMouthInner: 0.293,
    xCavityFloor: 1.24,
    bulletStations: [
      [0, -2.06],
      [0.228, -2.06],
      [0.294, -1.68],
      [0.294, -1.23],
      [0.279, -1.2],
      [0.293, -1.16],
      [0.282, -0.86],
      [0.252, -0.48],
      [0.202, -0.1],
      [0.136, 0.24],
      [0.062, 0.48],
      [0.018, 0.565],
      [0, 0.58],
    ],
  },
  '30_06': {
    xHead: -1.45,
    xMouth: 1.45,
    rPocket: 0.134,
    pocketDepth: 0.088,
    rRim: 0.275,
    rimBevel: 0.018,
    xRimEnd: -1.375,
    rGroove: 0.225,
    xGrooveRear: -1.355,
    xGrooveFront: -1.29,
    rBase: 0.274,
    xWeb: -1.255,
    shoulder: {
      rBodyTop: 0.26,
      xShoulderStart: 0.86,
      rNeck: 0.172,
      xShoulderEnd: 1.08,
    },
    rMouthOuter: 0.17,
    rMouthInner: 0.152,
    xCavityFloor: 1.05,
    bulletStations: [
      [0, -0.42],
      [0.146, -0.42],
      [0.154, -0.34],
      [0.154, -0.08],
      [0.146, -0.06],
      [0.154, -0.03],
      [0.154, 0.14],
      [0.132, 0.42],
      [0.088, 0.68],
      [0.036, 0.88],
      [0.012, 0.945],
      [0, 0.96],
    ],
  },
  '30_30_win': {
    // Classic rimmed lever-action case with crisp flanged rim undercut & flat-nose tubular-safe bullet
    xHead: -1.18,
    xMouth: 1.18,
    rPocket: 0.134,
    pocketDepth: 0.088,
    rRim: 0.325,
    rimBevel: 0.016,
    xRimEnd: -1.12,
    rGroove: 0.256,
    xGrooveRear: -1.108,
    xGrooveFront: -1.078,
    rBase: 0.268,
    xWeb: -1.055,
    shoulder: {
      rBodyTop: 0.264,
      xShoulderStart: 0.56,
      rNeck: 0.174,
      xShoulderEnd: 0.86,
    },
    rMouthOuter: 0.172,
    rMouthInner: 0.154,
    xCavityFloor: 0.84,
    bulletStations: [
      [0, -0.34],
      [0.148, -0.34],
      [0.155, -0.26],
      [0.155, -0.07],
      [0.146, -0.05],
      [0.155, -0.03],
      [0.155, 0.24],
      [0.135, 0.46],
      [0.088, 0.66],
      [0.068, 0.72],
      [0, 0.72],
    ],
  },
  '9x39_subsonic': {
    xHead: -1.12,
    xMouth: 1.12,
    rPocket: 0.152,
    pocketDepth: 0.095,
    rRim: 0.325,
    rimBevel: 0.022,
    xRimEnd: -1.025,
    rGroove: 0.271,
    xGrooveRear: -0.998,
    xGrooveFront: -0.915,
    rBase: 0.325,
    xWeb: -0.86,
    shoulder: {
      rBodyTop: 0.304,
      xShoulderStart: 0.68,
      rNeck: 0.285,
      xShoulderEnd: 0.8,
    },
    rMouthOuter: 0.285,
    rMouthInner: 0.268,
    xCavityFloor: 0.56,
    bulletStations: [
      [0, -1.24],
      [0.228, -1.24],
      [0.268, -1.08],
      [0.268, -0.76],
      [0.258, -0.52],
      [0.226, -0.26],
      [0.168, -0.04],
      [0.095, 0.12],
      [0.032, 0.195],
      [0, 0.22],
    ],
  },
  '545_m74': {
    xHead: -1.14,
    xMouth: 1.14,
    rPocket: 0.132,
    pocketDepth: 0.092,
    rRim: 0.285,
    rimBevel: 0.02,
    xRimEnd: -1.05,
    rGroove: 0.239,
    xGrooveRear: -1.022,
    xGrooveFront: -0.942,
    rBase: 0.285,
    xWeb: -0.89,
    shoulder: {
      rBodyTop: 0.264,
      xShoulderStart: 0.64,
      rNeck: 0.18,
      xShoulderEnd: 0.82,
    },
    rMouthOuter: 0.179,
    rMouthInner: 0.161,
    xCavityFloor: 0.62,
    bulletStations: [
      [0, -1.18],
      [0.128, -1.18],
      [0.161, -1.02],
      [0.161, -0.76],
      [0.155, -0.54],
      [0.132, -0.28],
      [0.092, -0.04],
      [0.045, 0.13],
      [0.015, 0.2],
      [0, 0.22],
    ],
  },
  '762_nato': {
    xHead: -1.45,
    xMouth: 1.45,
    rPocket: 0.152,
    pocketDepth: 0.1,
    rRim: 0.342,
    rimBevel: 0.022,
    xRimEnd: -1.348,
    rGroove: 0.285,
    xGrooveRear: -1.314,
    xGrooveFront: -1.215,
    rBase: 0.34,
    xWeb: -1.158,
    shoulder: {
      rBodyTop: 0.326,
      xShoulderStart: 0.88,
      rNeck: 0.248,
      xShoulderEnd: 1.12,
    },
    rMouthOuter: 0.247,
    rMouthInner: 0.224,
    xCavityFloor: 0.84,
    bulletStations: [
      [0, -1.28],
      [0.184, -1.28],
      [0.224, -1.1],
      [0.224, -0.84],
      [0.214, -0.82],
      [0.223, -0.79],
      [0.214, -0.62],
      [0.188, -0.34],
      [0.142, -0.06],
      [0.082, 0.16],
      [0.028, 0.28],
      [0, 0.32],
    ],
  },
  '792_mauser': {
    xHead: -1.42,
    xMouth: 1.42,
    rPocket: 0.15,
    pocketDepth: 0.096,
    rRim: 0.31,
    rimBevel: 0.02,
    xRimEnd: -1.33,
    rGroove: 0.255,
    xGrooveRear: -1.298,
    xGrooveFront: -1.21,
    rBase: 0.308,
    xWeb: -1.16,
    shoulder: {
      rBodyTop: 0.285,
      xShoulderStart: 0.78,
      rNeck: 0.214,
      xShoulderEnd: 1.06,
    },
    rMouthOuter: 0.212,
    rMouthInner: 0.194,
    xCavityFloor: 1.02,
    bulletStations: [
      [0, -0.44],
      [0.155, -0.44],
      [0.194, -0.32],
      [0.194, -0.07],
      [0.184, -0.05],
      [0.194, -0.02],
      [0.194, 0.14],
      [0.165, 0.44],
      [0.108, 0.7],
      [0.044, 0.88],
      [0.014, 0.94],
      [0, 0.95],
    ],
  },
};

function finalizeMagazineLathe(
  pts: THREE.Vector2[],
  segments: number
): THREE.BufferGeometry {
  // Clamp axial pole radius to 1e-4 cm (1 micron) so every pole triangle has non-zero area
  // and `computeVertexNormals()` yields strictly finite unit-length normals with zero shading pinch.
  const safePts = pts.map((p) =>
    p.x < 1e-4 ? new THREE.Vector2(1e-4, p.y) : p
  );
  const geo = new THREE.LatheGeometry(safePts, segments);
  geo.rotateZ(-Math.PI / 2);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Builds sculpted, owned cutaway-grade cartridge geometries (`caseGeo`, `livePrimerGeo`,
 * `bulletGeo`) with crisp beveled rims, undercut extractor grooves, recessed chamfered
 * Boxer primer pockets with crowned primer cups, and crimped copper-FMJ ogives.
 * Always returns caller-owned buffers whose `.dispose()` safely frees GPU memory.
 */
export function buildDetailedMagazineCartridgeGeometries(
  caliberProfile: CaliberProfile
): DetailedMagazineCartridgeGeometries {
  const profile = CUTAWAY_METALLIC_PROFILES[caliberProfile];
  if (!profile) {
    // Multi-part / vertex-colored calibers (12ga crimson+high-brass, .357 JSP, G11 caseless,
    // archery arrows/bolts, heavy ordnance): clone shared templates so disposal stays strictly owned.
    const shared = getCaliberGeometries(caliberProfile);
    const caseGeo = shared.caseGeo.clone();
    const livePrimerGeo = shared.livePrimerGeo.clone();
    const bulletGeo = shared.bulletGeo.clone();
    caseGeo.computeBoundingBox();
    caseGeo.computeBoundingSphere();
    livePrimerGeo.computeBoundingBox();
    livePrimerGeo.computeBoundingSphere();
    bulletGeo.computeBoundingBox();
    bulletGeo.computeBoundingSphere();

    const isArchery = isArcheryCaliber(caliberProfile);
    return {
      caseGeo,
      livePrimerGeo,
      bulletGeo,
      hasCaseVertexColors: Boolean(caseGeo.getAttribute('color')),
      hasBulletVertexColors: Boolean(bulletGeo.getAttribute('color')),
      hasExtractorGrooveDetail: !isArchery && caliberProfile !== '473_caseless',
      hasRecessedPrimerPocket: !isArchery,
      dispose: () => {
        caseGeo.dispose();
        livePrimerGeo.dispose();
        bulletGeo.dispose();
      },
    };
  }

  const {
    xHead,
    xMouth,
    rPocket,
    pocketDepth,
    rRim,
    rimBevel,
    xRimEnd,
    rGroove,
    xGrooveRear,
    xGrooveFront,
    rBase,
    xWeb,
    shoulder,
    rMouthOuter,
    rMouthInner,
    xCavityFloor,
    bulletStations,
  } = profile;

  const xPocketFloor = xHead + pocketDepth;
  const crimpBevel = Math.min(0.016, rPocket * 0.11);
  const mouthChamfer = Math.min(0.01, (rMouthOuter - rMouthInner) * 0.45);
  const midBodyX = shoulder
    ? 0.5 * (xWeb + shoulder.xShoulderStart)
    : 0.5 * (xWeb + xMouth);
  const midBodyR = shoulder
    ? 0.5 * (rBase + shoulder.rBodyTop)
    : 0.5 * (rBase + rMouthOuter);

  const casePts: THREE.Vector2[] = [
    // 1. Recessed Boxer primer pocket + annular crimp bevel
    new THREE.Vector2(0, xPocketFloor),
    new THREE.Vector2(rPocket, xPocketFloor),
    new THREE.Vector2(rPocket, xHead + crimpBevel),
    new THREE.Vector2(rPocket + crimpBevel * 1.15, xHead),
    // 2. Flat headstamp annulus + crisp 45° beveled rim chamfer
    new THREE.Vector2(rRim - rimBevel, xHead),
    new THREE.Vector2(rRim, xHead + rimBevel),
    new THREE.Vector2(rRim, xRimEnd),
    // 3. Undercut extractor claw bevel + precision lathe groove + 40° web ramp
    new THREE.Vector2(rGroove + 0.008, xGrooveRear - 0.004),
    new THREE.Vector2(rGroove, xGrooveRear),
    new THREE.Vector2(rGroove, xGrooveFront),
    new THREE.Vector2(rGroove + 0.008, xGrooveFront + 0.006),
    new THREE.Vector2(rBase, xWeb),
    // 4. Tapered brass body (+ bottleneck shoulder when applicable)
    new THREE.Vector2(midBodyR, midBodyX),
  ];

  if (shoulder) {
    casePts.push(
      new THREE.Vector2(shoulder.rBodyTop, shoulder.xShoulderStart),
      new THREE.Vector2(shoulder.rNeck, shoulder.xShoulderEnd)
    );
  }

  casePts.push(
    // 5. Crisp beveled case mouth lip & inner bullet-seating neck cavity
    new THREE.Vector2(rMouthOuter, xMouth - mouthChamfer),
    new THREE.Vector2(rMouthOuter - mouthChamfer * 0.6, xMouth),
    new THREE.Vector2(rMouthInner, xMouth),
    new THREE.Vector2(rMouthInner, xCavityFloor),
    new THREE.Vector2(0, xCavityFloor)
  );

  const caseGeo = finalizeMagazineLathe(casePts, 36);

  // Recessed domed silver/nickel Boxer primer cup nestled cleanly inside pocket bevel
  const rCup = rPocket * 0.915;
  const xPrimerFace = xHead + 0.007;
  const xPrimerSkirt = xPocketFloor - 0.004;
  const cupRadius = Math.min(0.022, rCup * 0.18);
  const primerPts: THREE.Vector2[] = [
    new THREE.Vector2(0, xPrimerFace - 0.002), // Subtle machined primer crown
    new THREE.Vector2(rCup * 0.62, xPrimerFace),
    new THREE.Vector2(rCup - cupRadius, xPrimerFace + 0.001),
    new THREE.Vector2(rCup - cupRadius * 0.3, xPrimerFace + cupRadius * 0.44),
    new THREE.Vector2(rCup, xPrimerFace + cupRadius),
    new THREE.Vector2(rCup, xPrimerSkirt),
    new THREE.Vector2(0, xPrimerSkirt),
  ];
  const livePrimerGeo = finalizeMagazineLathe(primerPts, 28);

  // Copper-FMJ projectile with crisp bearing band, crimp cannelure, and tangent/secant ogive
  const bulletPts: THREE.Vector2[] = bulletStations.map(
    ([r, x]) => new THREE.Vector2(r, x)
  );
  const bulletGeo = finalizeMagazineLathe(bulletPts, 36);

  return {
    caseGeo,
    livePrimerGeo,
    bulletGeo,
    hasCaseVertexColors: false,
    hasBulletVertexColors: false,
    hasExtractorGrooveDetail: true,
    hasRecessedPrimerPocket: true,
    dispose: () => {
      caseGeo.dispose();
      livePrimerGeo.dispose();
      bulletGeo.dispose();
    },
  };
}

/**
 * Calibrated dual-material gunsmith PBR parameters for cutaway magazine ammo stacks:
 * separates golden C26000 cartridge brass, bright recessed nickel-silver Boxer primers,
 * and warm copper-FMJ gilding-metal bullet jackets (plus lacquered steel, 12ga crimson
 * ribbed hulls, molded caseless propellant blocks, and woven carbon archery shafts).
 */
export function getMagazineCartridgeMaterialPreset(
  caliberProfile: CaliberProfile
): MagazineCartridgeMaterialPreset {
  const calSpec = CALIBER_VISUAL_SPECS[caliberProfile];
  const isArchery = isArcheryCaliber(caliberProfile);

  if (isArchery) {
    return {
      caseColor: '#ffffff',
      caseMetalness: 0.24,
      caseRoughness: 0.42,
      caseClearcoat: 0.18,
      caseClearcoatRoughness: 0.32,
      caseEnvMapIntensity: 1.15,
      primerColor: calSpec.primerColor,
      primerMetalness: 0.42,
      primerRoughness: 0.28,
      primerClearcoat: 0.14,
      primerEnvMapIntensity: 1.15,
      bulletColor: '#ffffff',
      bulletMetalness: 0.88,
      bulletRoughness: 0.2,
      bulletClearcoat: 0.14,
      bulletEnvMapIntensity: 1.4,
    };
  }

  if (caliberProfile === '473_caseless') {
    return {
      caseColor: calSpec.caseColor,
      caseMetalness: 0.08,
      caseRoughness: 0.72,
      caseClearcoat: 0.04,
      caseClearcoatRoughness: 0.64,
      caseEnvMapIntensity: 0.9,
      primerColor: calSpec.primerColor,
      primerMetalness: 0.68,
      primerRoughness: 0.32,
      primerClearcoat: 0.1,
      primerEnvMapIntensity: 1.1,
      bulletColor: calSpec.bulletColor,
      bulletMetalness: 0.9,
      bulletRoughness: 0.19,
      bulletClearcoat: 0.16,
      bulletEnvMapIntensity: 1.5,
    };
  }

  if (caliberProfile === '12_gauge') {
    return {
      caseColor: '#ffffff', // Vertex-colored high-brass base + crimson ribbed polymer hull
      caseMetalness: 0.38,
      caseRoughness: 0.32,
      caseClearcoat: 0.26,
      caseClearcoatRoughness: 0.22,
      caseEnvMapIntensity: 1.28,
      primerColor: calSpec.primerColor,
      primerMetalness: 0.94,
      primerRoughness: 0.15,
      primerClearcoat: 0.2,
      primerEnvMapIntensity: 1.6,
      bulletColor: '#ffffff',
      bulletMetalness: 0.32,
      bulletRoughness: 0.44,
      bulletClearcoat: 0.08,
      bulletEnvMapIntensity: 1.1,
    };
  }

  if (caliberProfile === '9x39_subsonic' || caliberProfile === '545_m74') {
    // Soviet olive-green polymer/lacquer-coated steel cases vs bright copper-washed FMJ jackets
    return {
      caseColor: calSpec.caseColor,
      caseMetalness: 0.48,
      caseRoughness: 0.34,
      caseClearcoat: 0.3,
      caseClearcoatRoughness: 0.24,
      caseEnvMapIntensity: 1.25,
      primerColor: calSpec.primerColor,
      primerMetalness: 0.94,
      primerRoughness: 0.15,
      primerClearcoat: 0.18,
      primerEnvMapIntensity: 1.6,
      bulletColor: calSpec.bulletColor,
      bulletMetalness: 0.89,
      bulletRoughness: 0.2,
      bulletClearcoat: 0.16,
      bulletEnvMapIntensity: 1.52,
    };
  }

  return {
    caseColor: calSpec.caseColor,
    caseMetalness: 0.92,
    caseRoughness: 0.18,
    caseClearcoat: 0.24,
    caseClearcoatRoughness: 0.16,
    caseEnvMapIntensity: 1.48,
    primerColor: calSpec.primerColor,
    primerMetalness: 0.96,
    primerRoughness: 0.13,
    primerClearcoat: 0.2,
    primerEnvMapIntensity: 1.65,
    bulletColor: calSpec.bulletColor,
    bulletMetalness: 0.89,
    bulletRoughness: 0.21,
    bulletClearcoat: 0.16,
    bulletEnvMapIntensity: 1.52,
  };
}

// ============================================================================
// Module-Pooled Scratch Math Primitives (Zero GC inside 60fps `useFrame`)
// ============================================================================

const _magPose = createMutablePose();
const _slotPose = createMutableMagazineRoundPose();

const _eAssembled = new THREE.Euler();
const _eLive = new THREE.Euler();
const _eRound = new THREE.Euler();

const _qAssembledInv = new THREE.Quaternion();
const _qLive = new THREE.Quaternion();
const _qDelta = new THREE.Quaternion();
const _qRound = new THREE.Quaternion();

const _vAssembled = new THREE.Vector3();
const _vLive = new THREE.Vector3();
const _vDelta = new THREE.Vector3();

const _vShiftCase = new THREE.Vector3();
const _vShiftBullet = new THREE.Vector3();
const _vInstPos = new THREE.Vector3();
const _vScale = new THREE.Vector3();
const _mInst = new THREE.Matrix4();

const NOOP_RAYCAST: THREE.Object3D['raycast'] = () => {
  // Intentionally empty: BOM / Field-Strip / Malfunction clicks pass straight through
  // to `mag_body` / `mag_follower` with zero raycast cost across 30+ lathe instances.
};

function findMagBodyPart(
  parts: readonly WeaponPartSpec[],
  partId: string
): WeaponPartSpec | null {
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].id === partId) return parts[i];
  }
  return null;
}

function writeCartridgeInstanceMatrices(
  instanceIdx: number,
  px: number,
  py: number,
  pz: number,
  rx: number,
  ry: number,
  rz: number,
  uniformScale: number,
  magLocalShiftX: number,
  bulletLocalOffset: number,
  caseMesh: THREE.InstancedMesh,
  primerMesh: THREE.InstancedMesh,
  bulletMesh: THREE.InstancedMesh
): void {
  _eRound.set(rx, ry, rz);
  _qRound.setFromEuler(_eRound);
  _vScale.set(uniformScale, uniformScale, uniformScale);

  // 1. Case & Live Boxer Primer: worldPos = P + S * R * [magLocalShiftX, 0, 0]
  _vShiftCase
    .set(magLocalShiftX * uniformScale, 0, 0)
    .applyQuaternion(_qRound);
  _vInstPos.set(px + _vShiftCase.x, py + _vShiftCase.y, pz + _vShiftCase.z);
  _mInst.compose(_vInstPos, _qRound, _vScale);
  caseMesh.setMatrixAt(instanceIdx, _mInst);
  primerMesh.setMatrixAt(instanceIdx, _mInst);

  // 2. Jacketed Projectile: worldPos = P + S * R * [magLocalShiftX + bulletLocalOffset, 0, 0]
  _vShiftBullet
    .set((magLocalShiftX + bulletLocalOffset) * uniformScale, 0, 0)
    .applyQuaternion(_qRound);
  _vInstPos.set(
    px + _vShiftBullet.x,
    py + _vShiftBullet.y,
    pz + _vShiftBullet.z
  );
  _mInst.compose(_vInstPos, _qRound, _vScale);
  bulletMesh.setMatrixAt(instanceIdx, _mInst);
}

function syncMagazineStackFrame(
  weaponId: WeaponId,
  group: THREE.Group,
  caseMesh: THREE.InstancedMesh,
  primerMesh: THREE.InstancedMesh,
  bulletMesh: THREE.InstancedMesh
): void {
  const appState = useAppStore.getState();
  if (appState.screen === 'cartridges' || appState.hiddenGroups.magazine) {
    group.visible = false;
    return;
  }

  const plugin = getLoadedWeaponPlugin(weaponId);
  if (!plugin) {
    group.visible = false;
    return;
  }

  const spec = MAGAZINE_STACK_SPECS[weaponId];
  if (!spec || spec.roundCount <= 0 || spec.slots.length === 0) {
    group.visible = false;
    caseMesh.count = 0;
    primerMesh.count = 0;
    bulletMesh.count = 0;
    return;
  }
  if (
    appState.screen === 'workbench' &&
    appState.isolateSelected &&
    appState.selectedPartId !== null &&
    appState.selectedPartId !== spec.magBodyPartId &&
    appState.selectedPartId !== spec.throatPartId
  ) {
    group.visible = false;
    return;
  }

  const magBodyPart = findMagBodyPart(plugin.parts, spec.magBodyPartId);
  if (!magBodyPart) {
    group.visible = false;
    return;
  }

  const clock = playbackClock.getState();
  const explodeT = clock.animatedProgress;
  const fireF = clock.animatedFireProgress;

  const isFiringMode = appState.mode === 'firing';
  const isFieldStrip =
    appState.screen === 'workbench' &&
    appState.fieldStripActive &&
    appState.mode === 'explode';
  const isMalfunction =
    appState.screen === 'workbench' && appState.malfunctionActive;
  const isLiveFiring =
    (appState.screen === 'workbench' ||
      appState.screen === 'split_showdown') &&
    isFiringMode &&
    !isMalfunction;

  // Smoothly scale out the cartridge column during internal magazine sub-disassembly
  // (`t > magSubStripStartT`) so exploding follower & compressed spring separate with zero clipping.
  let subStripScale = 1;
  if (
    !isFieldStrip &&
    !isFiringMode &&
    !isMalfunction &&
    explodeT > spec.magSubStripStartT
  ) {
    const subSpan = Math.min(0.11, Math.max(0.06, 0.62 - spec.magSubStripStartT));
    const uSub = smoothstep01((explodeT - spec.magSubStripStartT) / subSpan);
    subStripScale = 1 - uSub;
    if (subStripScale <= 0.005) {
      group.visible = false;
      return;
    }
  }

  // Evaluate live `mag_body` pose identically to `PartActor.tsx` and compute exact SE(3) rigid delta
  if (isFieldStrip) {
    fieldStripStore.evaluatePartPoseInto(weaponId, magBodyPart, _magPose);
  } else {
    evaluatePartPoseInto(
      magBodyPart,
      explodeT,
      isFiringMode,
      fireF,
      plugin.computeFiringKinematics,
      _magPose
    );
    if (isMalfunction) {
      malfunctionStore.applyPartPoseDelta(weaponId, magBodyPart.id, _magPose);
    }
  }

  const baseRot = magBodyPart.assembledRot;
  _eAssembled.set(
    baseRot ? baseRot[0] : 0,
    baseRot ? baseRot[1] : 0,
    baseRot ? baseRot[2] : 0
  );
  _qAssembledInv.setFromEuler(_eAssembled).invert();
  _eLive.set(_magPose.rx, _magPose.ry, _magPose.rz);
  _qLive.setFromEuler(_eLive);

  // qDelta = qLive * qAssembled^-1; vDelta = pLive - qDelta * pAssembled
  _qDelta.multiplyQuaternions(_qLive, _qAssembledInv);
  _vAssembled
    .set(
      magBodyPart.assembledPos[0],
      magBodyPart.assembledPos[1],
      magBodyPart.assembledPos[2]
    )
    .applyQuaternion(_qDelta);
  _vLive.set(_magPose.px, _magPose.py, _magPose.pz);
  _vDelta.subVectors(_vLive, _vAssembled);

  group.position.copy(_vDelta);
  group.quaternion.copy(_qDelta);
  group.scale.set(1, 1, 1);
  group.visible = true;

  const manifest = getWeaponManifest(weaponId);
  const calSpec = CALIBER_VISUAL_SPECS[manifest.caliberProfile];
  const roundFit = WEAPON_ROUND_FIT[weaponId];
  const baseScale = roundFit.roundScale * subStripScale;
  const shiftX = roundFit.magLocalShiftX;
  const bulletOffset = calSpec.bulletLocalOffset;

  let instanceCursor = 0;

  if (isLiveFiring) {
    const feedShift01 = computeMagazineFeedShift(weaponId, fireF);
    const replenish01 = computeMagazineReplenishAlpha(weaponId, fireF);
    const handoffIdx = spec.firingHandoffSlotIndex;

    // 1. Reserve stack rounds (`handoffIdx + 1 .. N - 1`) shifting smoothly into `slot[i - 1]`
    // (`0 .. handoffIdx` omitted in live firing so `nextRoundRef` feeds/spirals freely into chamber!)
    for (let i = handoffIdx + 1; i < spec.roundCount; i++) {
      evaluateMagazineRoundSlotInto(weaponId, i, feedShift01, _slotPose);
      writeCartridgeInstanceMatrices(
        instanceCursor++,
        _slotPose.px,
        _slotPose.py,
        _slotPose.pz,
        _slotPose.rx,
        _slotPose.ry,
        _slotPose.rz,
        baseScale * _slotPose.scaleMult,
        shiftX,
        bulletOffset,
        caseMesh,
        primerMesh,
        bulletMesh
      );
    }

    // 2. Post-retraction bottom replacement round emerging into `slot[N - 1]` so `f = 1.0` == `f = 0.0`
    if (replenish01 > 0.008) {
      evaluateMagazineRoundSlotInto(
        weaponId,
        spec.roundCount,
        replenish01,
        _slotPose
      );
      const repScale = baseScale * clamp01(_slotPose.scaleMult);
      if (repScale > 0.004) {
        writeCartridgeInstanceMatrices(
          instanceCursor++,
          _slotPose.px,
          _slotPose.py,
          _slotPose.pz,
          _slotPose.rx,
          _slotPose.ry,
          _slotPose.rz,
          repScale,
          shiftX,
          bulletOffset,
          caseMesh,
          primerMesh,
          bulletMesh
        );
      }
    }
  } else {
    // Showcase, Armory, Workbench Explode, Field-Strip [G], and Malfunction [J]:
    // Render ALL `0 .. roundCount - 1` cartridges!
    for (let i = 0; i < spec.roundCount; i++) {
      const staggerShrink =
        subStripScale < 0.999
          ? clamp01(subStripScale * 1.25 - (1 - i / spec.roundCount) * 0.25)
          : 1;
      const roundScale = roundFit.roundScale * staggerShrink;
      if (roundScale <= 0.004) continue;
      evaluateMagazineRoundSlotInto(weaponId, i, 0, _slotPose);
      writeCartridgeInstanceMatrices(
        instanceCursor++,
        _slotPose.px,
        _slotPose.py,
        _slotPose.pz,
        _slotPose.rx,
        _slotPose.ry,
        _slotPose.rz,
        roundScale,
        shiftX,
        bulletOffset,
        caseMesh,
        primerMesh,
        bulletMesh
      );
    }
  }

  caseMesh.count = instanceCursor;
  primerMesh.count = instanceCursor;
  bulletMesh.count = instanceCursor;
  caseMesh.instanceMatrix.needsUpdate = true;
  primerMesh.instanceMatrix.needsUpdate = true;
  bulletMesh.instanceMatrix.needsUpdate = true;
}

/**
 * Museum-Grade Zero-GC 3D Full-Magazine Cartridge Stack Actor
 * -----------------------------------------------------------
 * Renders a completely loaded staggered/single/helical column of 1:1 SAAMI/CIP
 * brass cases, nickel Boxer primers, and copper-jacketed projectiles inside every
 * weapon's magazine across Showcase, Armory, and Workbench views (`renderOrder={2}`).
 */
export interface MagazineAmmoStackProps {
  weaponIdOverride?: WeaponId;
}

export const MagazineAmmoStack: React.FC<MagazineAmmoStackProps> = ({
  weaponIdOverride,
}) => {
  const storeWeaponId = useAppStore((s) => s.activeWeaponId);
  const activeWeaponId = weaponIdOverride ?? storeWeaponId;
  const isMagHidden = useAppStore((s) => s.hiddenGroups.magazine);
  // Subscribe to plugin readiness so initial turntable render populates immediately once plugin loads
  const plugin = useWeaponPlugin(activeWeaponId);

  const manifest = getWeaponManifest(activeWeaponId);
  const caliberProfile = manifest.caliberProfile;

  const detailedGeos = useMemo(
    () => buildDetailedMagazineCartridgeGeometries(caliberProfile),
    [caliberProfile]
  );
  useEffect(() => {
    return () => {
      detailedGeos.dispose();
    };
  }, [detailedGeos]);

  const matPreset = useMemo(
    () => getMagazineCartridgeMaterialPreset(caliberProfile),
    [caliberProfile]
  );

  const {
    caseGeo,
    livePrimerGeo,
    bulletGeo,
    hasCaseVertexColors,
    hasBulletVertexColors,
  } = detailedGeos;

  const groupRef = useRef<THREE.Group>(null);
  const caseMeshRef = useRef<THREE.InstancedMesh>(null);
  const primerMeshRef = useRef<THREE.InstancedMesh>(null);
  const bulletMeshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const grp = groupRef.current;
    const cm = caseMeshRef.current;
    const pm = primerMeshRef.current;
    const bm = bulletMeshRef.current;
    if (!grp || !cm || !pm || !bm) return;
    syncMagazineStackFrame(activeWeaponId, grp, cm, pm, bm);
  }, [activeWeaponId, caliberProfile, isMagHidden, plugin]);

  useFrame(() => {
    const grp = groupRef.current;
    const cm = caseMeshRef.current;
    const pm = primerMeshRef.current;
    const bm = bulletMeshRef.current;
    if (!grp || !cm || !pm || !bm) return;
    syncMagazineStackFrame(
      weaponIdOverride ?? useAppStore.getState().activeWeaponId,
      grp,
      cm,
      pm,
      bm
    );
  });

  const activeSpec = MAGAZINE_STACK_SPECS[activeWeaponId];
  if (isMagHidden || !activeSpec || activeSpec.roundCount <= 0) return null;

  return (
    <group ref={groupRef}>
      <instancedMesh
        key={`mag-case-${caliberProfile}`}
        ref={caseMeshRef}
        args={[caseGeo, undefined, MAX_MAGAZINE_STACK_INSTANCES]}
        frustumCulled={false}
        raycast={NOOP_RAYCAST}
        renderOrder={2}
      >
        <meshPhysicalMaterial
          color={hasCaseVertexColors ? '#ffffff' : matPreset.caseColor}
          vertexColors={hasCaseVertexColors}
          metalness={matPreset.caseMetalness}
          roughness={matPreset.caseRoughness}
          clearcoat={matPreset.caseClearcoat}
          clearcoatRoughness={matPreset.caseClearcoatRoughness}
          envMapIntensity={matPreset.caseEnvMapIntensity}
        />
      </instancedMesh>

      <instancedMesh
        key={`mag-primer-${caliberProfile}`}
        ref={primerMeshRef}
        args={[livePrimerGeo, undefined, MAX_MAGAZINE_STACK_INSTANCES]}
        frustumCulled={false}
        raycast={NOOP_RAYCAST}
        renderOrder={2}
      >
        <meshPhysicalMaterial
          color={matPreset.primerColor}
          metalness={matPreset.primerMetalness}
          roughness={matPreset.primerRoughness}
          clearcoat={matPreset.primerClearcoat}
          clearcoatRoughness={0.12}
          envMapIntensity={matPreset.primerEnvMapIntensity}
        />
      </instancedMesh>

      <instancedMesh
        key={`mag-bullet-${caliberProfile}`}
        ref={bulletMeshRef}
        args={[bulletGeo, undefined, MAX_MAGAZINE_STACK_INSTANCES]}
        frustumCulled={false}
        raycast={NOOP_RAYCAST}
        renderOrder={2}
      >
        <meshPhysicalMaterial
          color={hasBulletVertexColors ? '#ffffff' : matPreset.bulletColor}
          vertexColors={hasBulletVertexColors}
          metalness={matPreset.bulletMetalness}
          roughness={matPreset.bulletRoughness}
          clearcoat={matPreset.bulletClearcoat}
          clearcoatRoughness={0.18}
          envMapIntensity={matPreset.bulletEnvMapIntensity}
        />
      </instancedMesh>
    </group>
  );
};

MagazineAmmoStack.displayName = 'MagazineAmmoStack';
