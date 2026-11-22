import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  Lightformer,
} from '@react-three/drei';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import type { WeaponScaleProfile } from '../../weapons/types';
import { playbackClock } from '../clock/playbackClock';
import { lockLinearTextureColorSpace } from '../materials/pbrManager';
import type { GraphicsQualityTier } from './graphicsQuality';
import {
  getStudioHdriEnvIntensityForScale,
  getStudioHdriFileNameForScale,
  loadStudioHdriTexture,
} from './studioHdriManager';
import { evaluateWeaponTurntableEnvelopeInto } from './turntableStageMetrics';

// =====================================================================================
// 1. Studio Environment Profiles
// =====================================================================================

export type ArmoryEnvironmentPreset =
  'tactical_vault' | 'gunsmith_bench' | 'blueprint_daylight';

export const ARMORY_ENVIRONMENT_PRESETS: readonly ArmoryEnvironmentPreset[] = [
  'tactical_vault',
  'gunsmith_bench',
  'blueprint_daylight',
];

export const DEFAULT_ARMORY_ENVIRONMENT: ArmoryEnvironmentPreset =
  'tactical_vault';

type Vec3 = readonly [number, number, number];

export interface StudioLightSpec {
  color: string;
  intensity: number;
  position: Vec3;
}

export interface StudioLightformerSpec {
  color: string;
  intensity: number;
  position: Vec3;
  /** Softbox width × height (cm in the virtual reflection dome) */
  scale: readonly [number, number];
  /** Explicit Euler rotation; when omitted the softbox aims at the origin */
  rotation?: Vec3;
  form?: 'rect' | 'ring' | 'circle';
}

export interface ArmoryEnvironmentConfig {
  id: ArmoryEnvironmentPreset;
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
  descriptionEn: string;
  tone: 'dark' | 'light';
  background: string;
  fog: { color: string; near: number; far: number };
  ambient: { color: string; intensity: number };
  hemisphere: { skyColor: string; groundColor: string; intensity: number };
  /** Shadow-casting key softbox */
  keyLight: StudioLightSpec;
  /** Back/grazing rim that carves silhouettes out of the dark */
  rimLight: StudioLightSpec;
  /** Camera-side fill */
  fillLight: StudioLightSpec;
  /** Overhead strip that runs along the barrel axis */
  topLight: StudioLightSpec;
  /** Low bounce for trigger guards / magwell undersides */
  underLight: StudioLightSpec;
  /** Base colour of the virtual reflection dome */
  environmentBackground: string;
  lightformers: readonly StudioLightformerSpec[];
  /** AgX exposure tuned so polished steel never clips to flat white */
  toneMappingExposure: number;
  postfx: { bloomStrength: number; gtaoIntensity: number };
  grid: {
    cellColor: string;
    sectionColor: string;
    fadeDistance: number;
  };
  contactShadowOpacity: number;
  mat: {
    rubber: string;
    speckleAmplitude: number;
    ink: string;
    inkMajor: string;
    accent: string;
    crosshair: string;
    trayFloor: string;
    sheenColor: string;
  };
  turntable: {
    platter: string;
    chassis: string;
    insert: string;
    etch: string;
    etchMajor: string;
    accentAmber: string;
    accentCyan: string;
    accentEmissive: number;
  };
}

export const ARMORY_ENVIRONMENTS: Readonly<
  Record<ArmoryEnvironmentPreset, ArmoryEnvironmentConfig>
> = {
  tactical_vault: {
    id: 'tactical_vault',
    labelZh: '战术军械库',
    labelEn: 'Tactical Vault',
    descriptionZh:
      '深邃枪灰黑曜石背景，冷钢主光配合暖钨丝掠射轮廓光，让氮化钢、硬质阳极铝与黄铜呈现分明的金属质感。',
    descriptionEn:
      'Deep gunmetal obsidian void with a crisp cool-steel key and warm tungsten grazing rims that make nitrided steel, hard-anodized aluminium and brass gleam.',
    tone: 'dark',
    background: '#0b1017',
    fog: { color: '#0e1014', near: 420, far: 555 },
    ambient: { color: '#d4d8de', intensity: 0.14 },
    hemisphere: {
      skyColor: '#d8dce2',
      groundColor: '#121418',
      intensity: 0.42,
    },
    keyLight: { color: '#fff9f2', intensity: 2.55, position: [14, 46, 28] },
    rimLight: { color: '#ffe4c4', intensity: 1.55, position: [-22, 26, -30] },
    fillLight: { color: '#dce4f0', intensity: 0.78, position: [-24, 12, 28] },
    topLight: { color: '#ffffff', intensity: 0.88, position: [0, 42, 4] },
    underLight: { color: '#6b7280', intensity: 0.36, position: [12, -16, -20] },
    environmentBackground: '#07080a',
    lightformers: [
      {
        color: '#e8f1ff',
        intensity: 2.6,
        position: [0, 15, 0],
        rotation: [Math.PI / 2, 0, 0],
        scale: [48, 6],
      },
      {
        color: '#d4e3ff',
        intensity: 2.1,
        position: [12, 8, 24],
        scale: [28, 9],
      },
      {
        color: '#9fb3cf',
        intensity: 1.1,
        position: [-14, 5, 22],
        scale: [24, 8],
      },
      {
        color: '#ffb066',
        intensity: 2.8,
        position: [-12, 7, -24],
        scale: [30, 5],
      },
      {
        color: '#ffc58a',
        intensity: 1.9,
        position: [14, 4, -22],
        scale: [24, 4],
      },
      {
        color: '#ffd3a1',
        intensity: 1.6,
        position: [28, 4, 0],
        scale: [22, 6],
      },
      {
        color: '#c7dcff',
        intensity: 1.2,
        position: [-28, 4, 0],
        scale: [22, 6],
      },
      {
        color: '#1a2330',
        intensity: 0.7,
        position: [0, -12, 0],
        rotation: [-Math.PI / 2, 0, 0],
        scale: [52, 28],
      },
    ],
    toneMappingExposure: 1.28,
    postfx: { bloomStrength: 0.26, gtaoIntensity: 1.05 },
    grid: { cellColor: '#161f2a', sectionColor: '#253142', fadeDistance: 135 },
    contactShadowOpacity: 0.44,
    mat: {
      rubber: '#12171f',
      speckleAmplitude: 9,
      ink: '#7a8ca1',
      inkMajor: '#becbd9',
      accent: '#f59e0b',
      crosshair: '#22d3ee',
      trayFloor: '#222831',
      sheenColor: '#2d3745',
    },
    turntable: {
      platter: '#1a2029',
      chassis: '#4a5361',
      insert: '#8a95a5',
      etch: '#a9b8ca',
      etchMajor: '#e8eef6',
      accentAmber: '#f59e0b',
      accentCyan: '#22d3ee',
      accentEmissive: 0.85,
    },
  },
  gunsmith_bench: {
    id: 'gunsmith_bench',
    labelZh: '军械师工作台',
    labelEn: "Gunsmith's Bench",
    descriptionZh:
      '炭灰色军械维修车间，4200K 暖色顶部条形工作灯配合钢蓝侧补光，还原真实枪匠台的检修氛围。',
    descriptionEn:
      "Charcoal armorer's workshop under warm 4200K overhead shop strips with a steel-blue side fill, like a real gunsmith's repair bench.",
    tone: 'dark',
    background: '#14181f',
    fog: { color: '#14181f', near: 420, far: 555 },
    ambient: { color: '#c8b9a4', intensity: 0.1 },
    hemisphere: { skyColor: '#ffe2bf', groundColor: '#0d1015', intensity: 0.34 },
    keyLight: { color: '#ffddb8', intensity: 2.1, position: [12, 44, 30] },
    rimLight: { color: '#90b6e8', intensity: 1.05, position: [-30, 18, -30] },
    fillLight: { color: '#82a9d8', intensity: 0.52, position: [-26, 10, 26] },
    topLight: { color: '#ffe4c2', intensity: 0.68, position: [0, 38, 0] },
    underLight: { color: '#3d3a36', intensity: 0.2, position: [8, -16, 22] },
    environmentBackground: '#0b0d11',
    lightformers: [
      {
        color: '#ffd6aa',
        intensity: 3.0,
        position: [0, 15, -4],
        rotation: [Math.PI / 2, 0, 0],
        scale: [54, 4],
      },
      {
        color: '#ffd6aa',
        intensity: 2.6,
        position: [0, 15, 6],
        rotation: [Math.PI / 2, 0, 0],
        scale: [54, 4],
      },
      {
        color: '#7ea6d8',
        intensity: 1.8,
        position: [-16, 6, 22],
        scale: [26, 10],
      },
      {
        color: '#7ea6d8',
        intensity: 1.5,
        position: [16, 6, -22],
        scale: [26, 10],
      },
      {
        color: '#ffe7c7',
        intensity: 1.6,
        position: [14, 8, 24],
        scale: [24, 8],
      },
      {
        color: '#ffcf9a',
        intensity: 1.3,
        position: [28, 4, 0],
        scale: [20, 6],
      },
      {
        color: '#2a2622',
        intensity: 0.8,
        position: [0, -12, 0],
        rotation: [-Math.PI / 2, 0, 0],
        scale: [52, 28],
      },
    ],
    toneMappingExposure: 1.14,
    postfx: { bloomStrength: 0.3, gtaoIntensity: 0.92 },
    grid: { cellColor: '#20262f', sectionColor: '#323b48', fadeDistance: 150 },
    contactShadowOpacity: 0.58,
    mat: {
      rubber: '#1a1f27',
      speckleAmplitude: 10,
      ink: '#9aa5b3',
      inkMajor: '#e2d6c3',
      accent: '#fbbf24',
      crosshair: '#7dd3fc',
      trayFloor: '#2b3038',
      sheenColor: '#4a4238',
    },
    turntable: {
      platter: '#22272f',
      chassis: '#5a6270',
      insert: '#9aa3ae',
      etch: '#c2c9d2',
      etchMajor: '#fff3df',
      accentAmber: '#fbbf24',
      accentCyan: '#7dd3fc',
      accentEmissive: 0.75,
    },
  },
  blueprint_daylight: {
    id: 'blueprint_daylight',
    labelZh: '博物馆日光蓝图',
    labelEn: 'Blueprint Daylight',
    descriptionZh:
      '明亮洁净的博物馆工程摄影棚，中性 6500K 柔光让每一条轮廓与剖面线都清晰可辨，适合技术图解检视。',
    descriptionEn:
      'Clean museum engineering studio with neutral 6500K soft light for high-contrast technical diagram inspection.',
    tone: 'light',
    background: '#dce4ee',
    fog: { color: '#dce4ee', near: 420, far: 560 },
    ambient: { color: '#f8fafc', intensity: 0.42 },
    hemisphere: {
      skyColor: '#f8fafc',
      groundColor: '#cbd5e1',
      intensity: 0.68,
    },
    keyLight: { color: '#fffaf2', intensity: 2.1, position: [28, 42, 38] },
    rimLight: { color: '#f8fafc', intensity: 1.8, position: [-28, 34, -36] },
    fillLight: { color: '#e2e8f0', intensity: 0.75, position: [-16, -10, 30] },
    topLight: { color: '#ffffff', intensity: 1.1, position: [-4, 40, 4] },
    underLight: {
      color: '#dbeafe',
      intensity: 0.55,
      position: [-10, -16, -28],
    },
    environmentBackground: '#384454',
    lightformers: [
      {
        color: '#ffffff',
        intensity: 3.1,
        position: [0, 15, 0],
        rotation: [Math.PI / 2, 0, 0],
        scale: [48, 10],
      },
      {
        color: '#fffcf5',
        intensity: 2.6,
        position: [12, 8, 24],
        scale: [28, 12],
      },
      {
        color: '#f1f5f9',
        intensity: 2.15,
        position: [-14, 5, 22],
        scale: [26, 11],
      },
      {
        color: '#fffcf5',
        intensity: 2.6,
        position: [-12, 8, -24],
        scale: [28, 12],
      },
      {
        color: '#f1f5f9',
        intensity: 2.15,
        position: [14, 5, -22],
        scale: [26, 11],
      },
      {
        color: '#f8fafc',
        intensity: 1.75,
        position: [28, 4, 0],
        scale: [24, 9],
      },
      {
        color: '#e0f2fe',
        intensity: 1.75,
        position: [-28, 4, 0],
        scale: [24, 9],
      },
      {
        color: '#64748b',
        intensity: 1.25,
        position: [0, -12, 0],
        rotation: [-Math.PI / 2, 0, 0],
        scale: [52, 28],
      },
    ],
    toneMappingExposure: 1.16,
    postfx: { bloomStrength: 0.22, gtaoIntensity: 0.78 },
    grid: { cellColor: '#d2dce8', sectionColor: '#bdcad9', fadeDistance: 92 },
    contactShadowOpacity: 0.42,
    mat: {
      rubber: '#24364d',
      speckleAmplitude: 7,
      ink: '#a9c4e4',
      inkMajor: '#f1f6fc',
      accent: '#fbbf24',
      crosshair: '#f8fafc',
      trayFloor: '#34465c',
      sheenColor: '#6f8cb0',
    },
    turntable: {
      platter: '#3a4350',
      chassis: '#8e98a6',
      insert: '#c6ced8',
      etch: '#e2e8f0',
      etchMajor: '#ffffff',
      accentAmber: '#d97706',
      accentCyan: '#0284c7',
      accentEmissive: 0.45,
    },
  },
};

export function getArmoryEnvironment(
  preset: ArmoryEnvironmentPreset
): ArmoryEnvironmentConfig {
  return ARMORY_ENVIRONMENTS[preset] ?? ARMORY_ENVIRONMENTS.tactical_vault;
}

// =====================================================================================
// 2. 1:1 Armorer's Takedown Mat — physical spec (1 world unit = 1 cm)
// =====================================================================================

export interface MatTrayCompartmentSpec {
  id: string;
  labelZh: string;
  labelEn: string;
  shape: 'rect' | 'circle';
  /** Mat-local centre (cm). +X muzzle, -Z far edge ("upper" when seen from the camera) */
  cx: number;
  cz: number;
  /** rect: full width/depth; circle: width = depth = diameter */
  width: number;
  depth: number;
  cornerRadius: number;
}

export interface TakedownMatSpec {
  widthCm: number;
  depthCm: number;
  thicknessCm: number;
  lipHeightCm: number;
  lipWidthCm: number;
  cornerRadiusCm: number;
  trayRecessCm: number;
  trayCompartments: readonly MatTrayCompartmentSpec[];
}

export const TAKEDOWN_MAT_SPEC: TakedownMatSpec = {
  widthCm: 110,
  depthCm: 52,
  thicknessCm: 0.45,
  lipHeightCm: 0.3,
  lipWidthCm: 1.6,
  cornerRadiusCm: 2.4,
  trayRecessCm: 0.3,
  trayCompartments: [
    {
      id: 'pins',
      labelZh: '销钉',
      labelEn: 'PINS',
      shape: 'rect',
      cx: 31.5,
      cz: -17.1,
      width: 9,
      depth: 11,
      cornerRadius: 1.2,
    },
    {
      id: 'springs',
      labelZh: '弹簧',
      labelEn: 'SPRINGS',
      shape: 'rect',
      cx: 44.5,
      cz: -20.1,
      width: 14.2,
      depth: 5,
      cornerRadius: 1.0,
    },
    {
      id: 'small_parts',
      labelZh: '小零件',
      labelEn: 'SMALL PARTS',
      shape: 'rect',
      cx: 40.7,
      cz: -13.9,
      width: 6.6,
      depth: 4.6,
      cornerRadius: 0.9,
    },
    {
      id: 'magnetic_bowl',
      labelZh: '磁吸槽',
      labelEn: 'MAG',
      shape: 'circle',
      cx: 48.0,
      cz: -13.9,
      width: 4.6,
      depth: 4.6,
      cornerRadius: 2.3,
    },
  ],
};

/** Axis-aligned bounds of the recessed magnetic parts tray region (mat-local cm) */
export function getMatTrayBounds(spec: TakedownMatSpec = TAKEDOWN_MAT_SPEC): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of spec.trayCompartments) {
    minX = Math.min(minX, c.cx - c.width / 2);
    maxX = Math.max(maxX, c.cx + c.width / 2);
    minZ = Math.min(minZ, c.cz - c.depth / 2);
    maxZ = Math.max(maxZ, c.cz + c.depth / 2);
  }
  return { minX, maxX, minZ, maxZ };
}

function roundedRectPath(
  path: THREE.Path,
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: number,
  clockwise: boolean
): void {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const rr = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001));
  if (!clockwise) {
    path.moveTo(x0 + rr, y0);
    path.lineTo(x1 - rr, y0);
    path.quadraticCurveTo(x1, y0, x1, y0 + rr);
    path.lineTo(x1, y1 - rr);
    path.quadraticCurveTo(x1, y1, x1 - rr, y1);
    path.lineTo(x0 + rr, y1);
    path.quadraticCurveTo(x0, y1, x0, y1 - rr);
    path.lineTo(x0, y0 + rr);
    path.quadraticCurveTo(x0, y0, x0 + rr, y0);
  } else {
    path.moveTo(x0 + rr, y0);
    path.quadraticCurveTo(x0, y0, x0, y0 + rr);
    path.lineTo(x0, y1 - rr);
    path.quadraticCurveTo(x0, y1, x0 + rr, y1);
    path.lineTo(x1 - rr, y1);
    path.quadraticCurveTo(x1, y1, x1, y1 - rr);
    path.lineTo(x1, y0 + rr);
    path.quadraticCurveTo(x1, y0, x1 - rr, y0);
    path.lineTo(x0 + rr, y0);
  }
}

/** Shape-space Y is mapped to world -Z after the -90° X rotation applied below. */
function compartmentHole(c: MatTrayCompartmentSpec, grow: number): THREE.Path {
  const hole = new THREE.Path();
  if (c.shape === 'circle') {
    hole.absarc(c.cx, -c.cz, c.width / 2 + grow, 0, Math.PI * 2, true);
  } else {
    roundedRectPath(
      hole,
      c.cx,
      -c.cz,
      c.width + grow * 2,
      c.depth + grow * 2,
      c.cornerRadius + grow,
      true
    );
  }
  return hole;
}

/** Planar top-down UV so the 2048×1024 calibration texture lands at true 1:1 metric scale. */
export function applyMatPlanarUv(
  geo: THREE.BufferGeometry,
  spec: TakedownMatSpec = TAKEDOWN_MAT_SPEC
): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const W = spec.widthCm;
  const D = spec.depthCm;
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = THREE.MathUtils.clamp((pos.getX(i) + W / 2) / W, 0, 1);
    uv[i * 2 + 1] = THREE.MathUtils.clamp((D / 2 - pos.getZ(i)) / D, 0, 1);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export interface TakedownMatGeometries {
  slab: THREE.BufferGeometry;
  lip: THREE.BufferGeometry;
  trayFloor: THREE.BufferGeometry;
}

export const TAKEDOWN_MAT_SURFACE_OFFSET_Y = TAKEDOWN_MAT_SPEC.thicknessCm;

/**
 * Builds the beveled neoprene slab (resting on `y = 0` with top working surface at `+thicknessCm`),
 * the raised `+0.30 cm` perimeter lip (`+0.45 → +0.75 cm`), and the recessed magnetic tray floor
 * (`top = +0.15 cm`, `0.30 cm` recess). Pure Three.js — safe in headless Vitest.
 */
export function buildTakedownMatGeometries(
  spec: TakedownMatSpec = TAKEDOWN_MAT_SPEC
): TakedownMatGeometries {
  const W = spec.widthCm;
  const D = spec.depthCm;
  const slabBevelSize = 0.18;
  const slabBevelThk = 0.12;

  // --- Slab with tray compartments punched through ---
  const slabShape = new THREE.Shape();
  roundedRectPath(
    slabShape,
    0,
    0,
    W - slabBevelSize * 2,
    D - slabBevelSize * 2,
    spec.cornerRadiusCm - slabBevelSize,
    false
  );
  for (const c of spec.trayCompartments) {
    slabShape.holes.push(compartmentHole(c, slabBevelSize));
  }
  const slab = new THREE.ExtrudeGeometry(slabShape, {
    depth: spec.thicknessCm - slabBevelThk * 2,
    bevelEnabled: true,
    bevelThickness: slabBevelThk,
    bevelSize: slabBevelSize,
    bevelSegments: 3,
    curveSegments: 8,
  });
  slab.rotateX(-Math.PI / 2);
  slab.translate(0, slabBevelThk, 0);

  // --- Raised 0.3 cm perimeter lip (+0.45 -> +0.75 cm) ---
  const lipBevelSize = 0.1;
  const lipBevelThk = 0.08;
  const lipShape = new THREE.Shape();
  roundedRectPath(
    lipShape,
    0,
    0,
    W - lipBevelSize * 2,
    D - lipBevelSize * 2,
    spec.cornerRadiusCm - lipBevelSize,
    false
  );
  const lipHole = new THREE.Path();
  roundedRectPath(
    lipHole,
    0,
    0,
    W - spec.lipWidthCm * 2 + lipBevelSize * 2,
    D - spec.lipWidthCm * 2 + lipBevelSize * 2,
    Math.max(0.4, spec.cornerRadiusCm - spec.lipWidthCm + lipBevelSize),
    true
  );
  lipShape.holes.push(lipHole);
  const lip = new THREE.ExtrudeGeometry(lipShape, {
    depth: spec.lipHeightCm - lipBevelThk * 2,
    bevelEnabled: true,
    bevelThickness: lipBevelThk,
    bevelSize: lipBevelSize,
    bevelSegments: 2,
    curveSegments: 8,
  });
  lip.rotateX(-Math.PI / 2);
  lip.translate(0, spec.thicknessCm + lipBevelThk - 0.01, 0);

  // --- Recessed tray floor (top at +0.15 cm, recessed 0.30 cm below +0.45 cm top face) ---
  const tb = getMatTrayBounds(spec);
  const floorThk = spec.thicknessCm - spec.trayRecessCm;
  const trayFloor = new THREE.BoxGeometry(
    tb.maxX - tb.minX + 1.2,
    floorThk,
    tb.maxZ - tb.minZ + 1.2
  );
  trayFloor.translate(
    (tb.minX + tb.maxX) / 2,
    floorThk / 2,
    (tb.minZ + tb.maxZ) / 2
  );

  applyMatPlanarUv(slab, spec);
  applyMatPlanarUv(lip, spec);
  applyMatPlanarUv(trayFloor, spec);

  return { slab, lip, trayFloor };
}

// =====================================================================================
// 3. Headless-safe calibration data builders
// =====================================================================================

export type RulerTickKind = 'minor' | 'mid' | 'major';

export interface RulerTick {
  mm: number;
  kind: RulerTickKind;
  label: string | null;
}

/** 1 cm minor / 5 cm mid / 10 cm major vernier graduations (labels on every 5 cm). */
export function buildRulerTicks(lengthMm: number, stepMm = 10): RulerTick[] {
  const ticks: RulerTick[] = [];
  const n = Math.floor(lengthMm / stepMm + 1e-6);
  for (let i = 0; i <= n; i++) {
    const mm = i * stepMm;
    const kind: RulerTickKind =
      mm % 100 === 0 ? 'major' : mm % 50 === 0 ? 'mid' : 'minor';
    ticks.push({ mm, kind, label: kind === 'minor' ? null : String(mm) });
  }
  return ticks;
}

export interface ProtractorGraduation {
  deg: number;
  kind: 'minor' | 'major' | 'labeled';
}

export const PROTRACTOR_LABELED_ANGLES: readonly number[] = [15, 30, 45, 90];

export function buildProtractorGraduations(): ProtractorGraduation[] {
  const out: ProtractorGraduation[] = [];
  for (let deg = 0; deg <= 180; deg += 5) {
    const mirrored = deg <= 90 ? deg : 180 - deg;
    const kind = PROTRACTOR_LABELED_ANGLES.includes(mirrored)
      ? 'labeled'
      : deg % 15 === 0
        ? 'major'
        : 'minor';
    out.push({ deg, kind });
  }
  return out;
}

export interface SaamiCartridgeSilhouetteSpec {
  id: string;
  labelZh: string;
  labelEn: string;
  rimDiameterMm: number;
  baseDiameterMm: number;
  shoulderDiameterMm: number | null;
  shoulderStartMm: number | null;
  neckStartMm: number | null;
  neckDiameterMm: number;
  caseLengthMm: number;
  bulletDiameterMm: number;
  overallLengthMm: number;
  muzzleEnergyJ: number;
}

/** SAAMI / CIP maximum-cartridge reference dimensions (mm) for the 1:1 mat silhouettes. */
export const SAAMI_REFERENCE_CARTRIDGES: readonly SaamiCartridgeSilhouetteSpec[] =
  [
    {
      id: '9x19',
      labelZh: '9×19毫米 帕拉贝鲁姆',
      labelEn: '9×19mm Parabellum',
      rimDiameterMm: 9.96,
      baseDiameterMm: 9.93,
      shoulderDiameterMm: null,
      shoulderStartMm: null,
      neckStartMm: null,
      neckDiameterMm: 9.65,
      caseLengthMm: 19.15,
      bulletDiameterMm: 9.02,
      overallLengthMm: 29.69,
      muzzleEnergyJ: 500,
    },
    {
      id: '57x28',
      labelZh: '5.7×28毫米',
      labelEn: '5.7×28mm',
      rimDiameterMm: 7.95,
      baseDiameterMm: 7.95,
      shoulderDiameterMm: 7.4,
      shoulderStartMm: 21.3,
      neckStartMm: 23.4,
      neckDiameterMm: 6.35,
      caseLengthMm: 28.9,
      bulletDiameterMm: 5.7,
      overallLengthMm: 40.5,
      muzzleEnergyJ: 534,
    },
    {
      id: '556_nato',
      labelZh: '5.56×45毫米 北约',
      labelEn: '5.56×45mm NATO',
      rimDiameterMm: 9.6,
      baseDiameterMm: 9.58,
      shoulderDiameterMm: 9.0,
      shoulderStartMm: 36.52,
      neckStartMm: 39.55,
      neckDiameterMm: 6.43,
      caseLengthMm: 44.7,
      bulletDiameterMm: 5.7,
      overallLengthMm: 57.4,
      muzzleEnergyJ: 1796,
    },
    {
      id: '762_m43',
      labelZh: '7.62×39毫米 M43',
      labelEn: '7.62×39mm M43',
      rimDiameterMm: 11.35,
      baseDiameterMm: 11.35,
      shoulderDiameterMm: 10.07,
      shoulderStartMm: 30.5,
      neckStartMm: 32.0,
      neckDiameterMm: 8.6,
      caseLengthMm: 38.7,
      bulletDiameterMm: 7.92,
      overallLengthMm: 56.0,
      muzzleEnergyJ: 2010,
    },
    {
      id: '50_ae',
      labelZh: '.50 AE 马格南',
      labelEn: '.50 Action Express',
      rimDiameterMm: 13.97,
      baseDiameterMm: 13.97,
      shoulderDiameterMm: null,
      shoulderStartMm: null,
      neckStartMm: null,
      neckDiameterMm: 13.4,
      caseLengthMm: 32.6,
      bulletDiameterMm: 12.7,
      overallLengthMm: 40.9,
      muzzleEnergyJ: 1920,
    },
    {
      id: '338_lapua',
      labelZh: '.338 拉普马格南',
      labelEn: '.338 Lapua Magnum',
      rimDiameterMm: 14.93,
      baseDiameterMm: 14.91,
      shoulderDiameterMm: 13.82,
      shoulderStartMm: 54.9,
      neckStartMm: 60.8,
      neckDiameterMm: 9.46,
      caseLengthMm: 69.2,
      bulletDiameterMm: 8.61,
      overallLengthMm: 93.5,
      muzzleEnergyJ: 6600,
    },
    {
      id: '50_bmg',
      labelZh: '.50 BMG 勃朗宁',
      labelEn: '.50 BMG',
      rimDiameterMm: 20.42,
      baseDiameterMm: 20.42,
      shoulderDiameterMm: 18.97,
      shoulderStartMm: 77.5,
      neckStartMm: 84.5,
      neckDiameterMm: 14.2,
      caseLengthMm: 99.3,
      bulletDiameterMm: 12.98,
      overallLengthMm: 138.0,
      muzzleEnergyJ: 18000,
    },
  ];

export type ProfilePoint = readonly [x: number, r: number];

/** Upper-half profile of a cartridge (x along axis from case head, r = radius), in mm. */
export function buildCartridgeProfileMm(c: SaamiCartridgeSilhouetteSpec): {
  casePts: ProfilePoint[];
  bulletPts: ProfilePoint[];
} {
  const rimR = c.rimDiameterMm / 2;
  const grooveR = Math.min(rimR, c.baseDiameterMm / 2) * 0.84;
  const casePts: ProfilePoint[] = [
    [0, 0],
    [0, rimR],
    [0.9, rimR],
    [1.3, grooveR],
    [2.1, grooveR],
    [2.7, c.baseDiameterMm / 2],
  ];
  if (
    c.shoulderDiameterMm !== null &&
    c.shoulderStartMm !== null &&
    c.neckStartMm !== null
  ) {
    casePts.push([c.shoulderStartMm, c.shoulderDiameterMm / 2]);
    casePts.push([c.neckStartMm, c.neckDiameterMm / 2]);
  }
  casePts.push([c.caseLengthMm, c.neckDiameterMm / 2]);
  casePts.push([c.caseLengthMm, 0]);

  const R = c.bulletDiameterMm / 2;
  const exposed = c.overallLengthMm - c.caseLengthMm;
  const bearingEnd = c.caseLengthMm + exposed * 0.22;
  const bulletPts: ProfilePoint[] = [
    [c.caseLengthMm, 0],
    [c.caseLengthMm, R],
    [bearingEnd, R],
  ];
  const ogiveSteps = 12;
  for (let i = 1; i <= ogiveSteps; i++) {
    const t = i / ogiveSteps;
    const x = bearingEnd + (c.overallLengthMm - bearingEnd) * t;
    const r = Math.max(
      R * 0.07,
      R * Math.pow(Math.cos((t * Math.PI) / 2), 0.72)
    );
    bulletPts.push([x, i === ogiveSteps ? R * 0.07 : r]);
  }
  bulletPts.push([c.overallLengthMm, 0]);
  return { casePts, bulletPts };
}

export interface AzimuthDialMark {
  deg: number;
  kind: 'minor' | 'mid' | 'major' | 'cardinal';
  label: string | null;
}

/** 72 laser-etched azimuth graduations (every 5°) with 3-digit numerals every 30°. */
export function buildAzimuthDialMarks(): AzimuthDialMark[] {
  const marks: AzimuthDialMark[] = [];
  for (let deg = 0; deg < 360; deg += 5) {
    const kind: AzimuthDialMark['kind'] =
      deg % 90 === 0
        ? 'cardinal'
        : deg % 30 === 0
          ? 'major'
          : deg % 10 === 0
            ? 'mid'
            : 'minor';
    marks.push({
      deg,
      kind,
      label: deg % 30 === 0 ? String(deg).padStart(3, '0') : null,
    });
  }
  return marks;
}

/** Deterministic mulberry32 PRNG so procedural textures are identical every boot. */
export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =====================================================================================
// 4. Canvas2D painters (context-injected so they run against a mock ctx in Node tests)
// =====================================================================================

export interface MatInkColors {
  ink: string;
  inkMajor: string;
  accent: string;
  crosshair: string;
}

const MONO_FONT =
  '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace';

function applyGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rand: () => number,
  amplitude: number
): void {
  if (amplitude <= 0) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Vulcanized rubber: fine per-pixel grain + sparse lighter filler specks
    let n = (rand() - 0.5) * amplitude;
    if (rand() > 0.9965) n += amplitude * 1.6;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Draws all printed calibration artwork. Mat-space mapping: canvas x ↔ world +X (muzzle right),
 * canvas y ↔ world +Z (near edge at the bottom), at an exact metric scale of w/110 px per cm.
 */
export function drawGunsmithMatInk(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  colors: MatInkColors,
  spec: TakedownMatSpec = TAKEDOWN_MAT_SPEC
): void {
  const W = spec.widthCm;
  const D = spec.depthCm;
  const sx = w / W;
  const sz = h / D;
  const s = (sx + sz) * 0.5;
  const px = (x: number) => (x + W / 2) * sx;
  const pz = (z: number) => (z + D / 2) * sz;
  const font = (cm: number, weight = 500) =>
    `${weight} ${Math.max(6, Math.round(cm * s))}px ${MONO_FONT}`;

  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  // --- Overlock perimeter stitching on the raised lip ---
  ctx.strokeStyle = colors.ink;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = Math.max(1, 0.12 * s);
  ctx.setLineDash([0.5 * s, 0.32 * s]);
  ctx.strokeRect(
    px(-W / 2 + 0.8),
    pz(-D / 2 + 0.8),
    (W - 1.6) * sx,
    (D - 1.6) * sz
  );
  ctx.setLineDash([]);

  // --- Inner work-area border & faint 5 cm technical grid ---
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(1, 0.06 * s);
  ctx.strokeRect(px(-W / 2 + 2), pz(-D / 2 + 2), (W - 4) * sx, (D - 4) * sz);
  ctx.globalAlpha = 0.08;
  ctx.beginPath();
  for (let x = -50; x <= 50; x += 5) {
    ctx.moveTo(px(x), pz(-22.5));
    ctx.lineTo(px(x), pz(22.5));
  }
  for (let z = -20; z <= 20; z += 5) {
    ctx.moveTo(px(-50), pz(z));
    ctx.lineTo(px(50), pz(z));
  }
  ctx.stroke();

  // --- X vernier ruler (0 … 1000 mm) along the near (+Z) border ---
  const xBase = D / 2 - 2.4;
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.ink;
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = Math.max(1, 0.06 * s);
  ctx.beginPath();
  ctx.moveTo(px(-50), pz(xBase));
  ctx.lineTo(px(50), pz(xBase));
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (const t of buildRulerTicks(1000)) {
    const x = -50 + t.mm / 10;
    const len = t.kind === 'major' ? 1.5 : t.kind === 'mid' ? 1.1 : 0.6;
    ctx.strokeStyle = t.kind === 'minor' ? colors.ink : colors.inkMajor;
    ctx.lineWidth = Math.max(1, (t.kind === 'minor' ? 0.05 : 0.09) * s);
    ctx.beginPath();
    ctx.moveTo(px(x), pz(xBase));
    ctx.lineTo(px(x), pz(xBase - len));
    ctx.stroke();
    if (t.label) {
      ctx.fillStyle = t.kind === 'major' ? colors.inkMajor : colors.ink;
      ctx.font = font(
        t.kind === 'major' ? 0.62 : 0.5,
        t.kind === 'major' ? 700 : 500
      );
      ctx.fillText(t.label, px(x), pz(xBase - len - 0.2));
    }
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colors.accent;
  ctx.font = font(0.55, 700);
  ctx.fillText('mm · X', px(-50), pz(xBase + 0.75));

  // --- Z vernier ruler (0 … 450 mm) along the left (-X) border ---
  const zBase = -W / 2 + 2.4;
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = Math.max(1, 0.06 * s);
  ctx.beginPath();
  ctx.moveTo(px(zBase), pz(-22.5));
  ctx.lineTo(px(zBase), pz(22.5));
  ctx.stroke();
  for (const t of buildRulerTicks(450)) {
    const z = -22.5 + t.mm / 10;
    const len = t.kind === 'major' ? 1.5 : t.kind === 'mid' ? 1.1 : 0.6;
    ctx.strokeStyle = t.kind === 'minor' ? colors.ink : colors.inkMajor;
    ctx.lineWidth = Math.max(1, (t.kind === 'minor' ? 0.05 : 0.09) * s);
    ctx.beginPath();
    ctx.moveTo(px(zBase), pz(z));
    ctx.lineTo(px(zBase + len), pz(z));
    ctx.stroke();
    if (t.label) {
      ctx.fillStyle = t.kind === 'major' ? colors.inkMajor : colors.ink;
      ctx.font = font(0.5, t.kind === 'major' ? 700 : 500);
      ctx.fillText(t.label, px(zBase + len + 0.25), pz(z));
    }
  }

  // --- Bore-axis alignment crosshair (+X MUZZLE) ---
  ctx.strokeStyle = colors.crosshair;
  ctx.fillStyle = colors.crosshair;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(1, 0.08 * s);
  ctx.setLineDash([1.2 * s, 0.5 * s]);
  ctx.beginPath();
  ctx.moveTo(px(-46), pz(0));
  ctx.lineTo(px(45.5), pz(0));
  ctx.stroke();
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.moveTo(px(0), pz(-21));
  ctx.lineTo(px(0), pz(21));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.moveTo(px(47.5), pz(0));
  ctx.lineTo(px(45.5), pz(-0.7));
  ctx.lineTo(px(45.5), pz(0.7));
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px(0), pz(0), 1.2 * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px(-2.2), pz(0));
  ctx.lineTo(px(2.2), pz(0));
  ctx.moveTo(px(0), pz(-2.2));
  ctx.lineTo(px(0), pz(2.2));
  ctx.stroke();
  ctx.font = font(0.7, 700);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('+X MUZZLE ▶ 枪口', px(45), pz(-0.45));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = font(0.5, 600);
  ctx.globalAlpha = 0.7;
  ctx.fillText('BORE AXIS DATUM · 枪膛轴线基准', px(-46), pz(0.45));
  ctx.fillText('+Z RIGHT ▼', px(0.6), pz(19.5));

  // --- FCG sear-angle protractor gauge ---
  const pcx = -36;
  const pcz = 13;
  const pr = 8;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = colors.ink;
  ctx.fillStyle = colors.ink;
  ctx.lineWidth = Math.max(1, 0.07 * s);
  ctx.beginPath();
  ctx.arc(px(pcx), pz(pcz), pr * s, Math.PI, Math.PI * 2);
  ctx.moveTo(px(pcx - pr), pz(pcz));
  ctx.lineTo(px(pcx + pr), pz(pcz));
  ctx.stroke();
  for (const g of buildProtractorGraduations()) {
    const a = THREE.MathUtils.degToRad(g.deg);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const inner = g.kind === 'minor' ? pr - 0.4 : pr - 0.85;
    ctx.strokeStyle = g.kind === 'labeled' ? colors.accent : colors.ink;
    ctx.lineWidth = Math.max(1, (g.kind === 'minor' ? 0.04 : 0.08) * s);
    ctx.beginPath();
    ctx.moveTo(px(pcx + ca * inner), pz(pcz - sa * inner));
    ctx.lineTo(px(pcx + ca * pr), pz(pcz - sa * pr));
    ctx.stroke();
    if (g.kind === 'labeled' && g.deg <= 90) {
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([0.3 * s, 0.25 * s]);
      ctx.beginPath();
      ctx.moveTo(px(pcx), pz(pcz));
      ctx.lineTo(px(pcx + ca * (pr - 0.9)), pz(pcz - sa * (pr - 0.9)));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.accent;
      ctx.font = font(0.55, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `${g.deg}°`,
        px(pcx + ca * (pr + 0.9)),
        pz(pcz - sa * (pr + 0.9))
      );
    }
  }
  ctx.fillStyle = colors.inkMajor;
  ctx.font = font(0.55, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('FCG SEAR ANGLE GAUGE · 阻铁角度规', px(pcx), pz(pcz + 0.5));

  // --- SAAMI / CIP 1:1 cartridge reference silhouettes ---
  const sx0 = 21;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = colors.inkMajor;
  ctx.font = font(0.55, 700);
  ctx.fillText(
    'SAAMI / CIP 1:1 CARTRIDGE REFERENCE · 弹药实尺',
    px(sx0),
    pz(3.2)
  );
  SAAMI_REFERENCE_CARTRIDGES.forEach((c, i) => {
    const rowZ = 4.8 + i * 2.25;
    const { casePts, bulletPts } = buildCartridgeProfileMm(c);
    const tracePoly = (pts: ProfilePoint[]) => {
      ctx.beginPath();
      pts.forEach(([x, r], k) => {
        const X = px(sx0 + x / 10);
        const Z = pz(rowZ - r / 10);
        if (k === 0) ctx.moveTo(X, Z);
        else ctx.lineTo(X, Z);
      });
      for (let k = pts.length - 1; k >= 0; k--) {
        ctx.lineTo(px(sx0 + pts[k][0] / 10), pz(rowZ + pts[k][1] / 10));
      }
      ctx.closePath();
    };
    ctx.lineWidth = Math.max(1, 0.05 * s);
    tracePoly(casePts);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = colors.accent;
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = colors.inkMajor;
    ctx.stroke();
    tracePoly(bulletPts);
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = colors.accent;
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = colors.accent;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.ink;
    ctx.font = font(0.48, 600);
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `${c.labelEn} · ${c.muzzleEnergyJ.toLocaleString('en-US')} J`,
      px(sx0 + c.overallLengthMm / 10 + 0.7),
      pz(rowZ)
    );
  });

  // --- Magnetic parts tray print ---
  const tb = getMatTrayBounds(spec);
  ctx.strokeStyle = colors.accent;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(1, 0.06 * s);
  ctx.setLineDash([0.6 * s, 0.3 * s]);
  ctx.strokeRect(
    px(tb.minX - 0.9),
    pz(tb.minZ - 0.9),
    (tb.maxX - tb.minX + 1.8) * sx,
    (tb.maxZ - tb.minZ + 1.8) * sz
  );
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.accent;
  ctx.font = font(0.5, 700);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(
    'MAGNETIC PARTS TRAY · 磁吸零件托盘',
    px(tb.minX - 0.9),
    pz(tb.maxZ + 1.2)
  );
  ctx.fillStyle = colors.ink;
  ctx.font = font(0.42, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (const c of spec.trayCompartments) {
    ctx.fillText(
      `${c.labelEn} ${c.labelZh}`,
      px(c.cx),
      pz(c.cz - c.depth / 2 - 0.15)
    );
  }

  // --- Maker's plate ---
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colors.inkMajor;
  ctx.font = font(0.7, 800);
  ctx.fillText(
    'DIGITAL ARMORY · ARMORER\u2019S TAKEDOWN MAT',
    px(-49.5),
    pz(-19.6)
  );
  ctx.fillStyle = colors.ink;
  ctx.font = font(0.48, 500);
  ctx.fillText(
    '1:1 METRIC · ANTI-STATIC VULCANIZED NEOPRENE · CLP / SOLVENT RESISTANT',
    px(-49.5),
    pz(-18.6)
  );
  ctx.fillText(
    '1 WORLD UNIT = 1 cm · +X MUZZLE / +Y UP / +Z RIGHT',
    px(-49.5),
    pz(-17.8)
  );

  ctx.restore();
}

export function paintGunsmithMatAlbedo(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  preset: ArmoryEnvironmentPreset,
  seed = 0x5eed1f
): void {
  const env = getArmoryEnvironment(preset);
  const rand = createSeededRandom(seed);
  ctx.fillStyle = env.mat.rubber;
  ctx.fillRect(0, 0, w, h);
  applyGrain(ctx, w, h, rand, env.mat.speckleAmplitude);
  drawGunsmithMatInk(ctx, w, h, env.mat);
}

const ROUGHNESS_INK: MatInkColors = {
  ink: 'rgb(150,150,150)',
  inkMajor: 'rgb(140,140,140)',
  accent: 'rgb(146,146,146)',
  crosshair: 'rgb(140,140,140)',
};

/** Roughness (G channel): vulcanized matte rubber ≈ 0.92, printed ink ≈ 0.72, CLP oil wipes ≈ 0.66. */
export function paintGunsmithMatRoughness(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed = 0xc1f0
): void {
  const rand = createSeededRandom(seed);
  ctx.fillStyle = 'rgb(236,236,236)';
  ctx.fillRect(0, 0, w, h);
  applyGrain(ctx, w, h, rand, 12);

  const sx = w / TAKEDOWN_MAT_SPEC.widthCm;
  const sz = h / TAKEDOWN_MAT_SPEC.depthCm;
  // Subtle CLP gun-oil wipe blotches & smears (restrained so matte rubber never glares like plastic)
  for (let i = 0; i < 18; i++) {
    const cx = rand() * w;
    const cy = rand() * h;
    const rx = (4 + rand() * 10) * sx;
    const ry = (2 + rand() * 6) * sz;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rand() * Math.PI);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    const strength = 0.22 + rand() * 0.24;
    g.addColorStop(0, `rgba(170,170,170,${strength.toFixed(3)})`);
    g.addColorStop(1, 'rgba(170,170,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(136,136,136,${(0.12 + rand() * 0.16).toFixed(3)})`;
    ctx.lineWidth = (0.8 + rand() * 1.6) * sz;
    ctx.beginPath();
    const x0 = rand() * w;
    const y0 = rand() * h;
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(
      x0 + (rand() - 0.5) * 30 * sx,
      y0 + (rand() - 0.5) * 12 * sz,
      x0 + (rand() - 0.5) * 50 * sx,
      y0 + (rand() - 0.5) * 8 * sz
    );
    ctx.stroke();
  }
  ctx.restore();
  drawGunsmithMatInk(ctx, w, h, ROUGHNESS_INK);
}

// =====================================================================================
// 5. Cached CanvasTextures (browser only; null in headless Node)
// =====================================================================================

export const GUNSMITH_MAT_TEXTURE_SIZE = {
  width: 2048,
  height: 1024,
  roughnessWidth: 1024,
  roughnessHeight: 512,
} as const;

export function canCreateCanvasTextures(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function'
  );
}

function createCanvas2d(
  w: number,
  h: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!canCreateCanvasTextures()) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  return { canvas, ctx };
}

export interface GunsmithMatTextures {
  albedo: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
}

const matAlbedoCache = new Map<ArmoryEnvironmentPreset, THREE.CanvasTexture>();
let matRoughnessTexture: THREE.CanvasTexture | null = null;

function finishTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (colorSpace === THREE.NoColorSpace) {
    // Lock linear roughness maps against R3F v8 `applyProps` unconditionally resetting `.colorSpace = SRGBColorSpace`
    lockLinearTextureColorSpace(tex);
  } else {
    tex.colorSpace = colorSpace;
  }
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Lazily paints & caches the 2048×1024 albedo (per preset) and shared 1024×512 roughness map. */
export function getGunsmithMatTextures(
  preset: ArmoryEnvironmentPreset
): GunsmithMatTextures | null {
  if (!canCreateCanvasTextures()) return null;
  let albedo = matAlbedoCache.get(preset);
  if (!albedo) {
    const c = createCanvas2d(
      GUNSMITH_MAT_TEXTURE_SIZE.width,
      GUNSMITH_MAT_TEXTURE_SIZE.height
    );
    if (!c) return null;
    paintGunsmithMatAlbedo(c.ctx, c.canvas.width, c.canvas.height, preset);
    albedo = finishTexture(c.canvas, THREE.SRGBColorSpace);
    albedo.name = `GunsmithMat.albedo.${preset}`;
    matAlbedoCache.set(preset, albedo);
  }
  if (!matRoughnessTexture) {
    const c = createCanvas2d(
      GUNSMITH_MAT_TEXTURE_SIZE.roughnessWidth,
      GUNSMITH_MAT_TEXTURE_SIZE.roughnessHeight
    );
    if (!c) return null;
    paintGunsmithMatRoughness(c.ctx, c.canvas.width, c.canvas.height);
    matRoughnessTexture = finishTexture(c.canvas, THREE.NoColorSpace);
    matRoughnessTexture.name = 'GunsmithMat.roughness';
  }
  return { albedo, roughness: matRoughnessTexture };
}

// =====================================================================================
// 5b. Heavy Armor 1:1 Concrete Hangar Floor (18 m × 12 m marked bay + 2.6 m feathered apron)
// =====================================================================================

export const HEAVY_ARMOR_HANGAR_SPEC = {
  widthCm: 1800,
  depthCm: 1200,
  /** Outer concrete dissolve margin beyond the 18 m × 12 m bay so the floor feathers into hangar fog */
  featherMarginCm: 260,
  totalWidthCm: 2320,
  totalDepthCm: 1720,
  thicknessCm: 4.0,
  /** Top deck sits at +1.0 cm above `gridY = -121.0 cm` -> world `Y = -120.0 cm` (exact track contact!) */
  topOffsetYCm: 1.0,
  turntablePitRadiusCm: 480, // Ø 9.6 m circular steel turntable pit ring
  expansionJointCm: 300, // 3 m × 3 m poured concrete bay grid
  trackLaneZCm: 140, // Twin rubber/steel tank-track scuff lanes along Z = ±140 cm
} as const;

export const HEAVY_ARMOR_HANGAR_TEXTURE_SIZE = {
  albedoWidth: 2048,
  albedoHeight: 1536,
  normalWidth: 1024,
  normalHeight: 768,
  roughnessWidth: 1024,
  roughnessHeight: 768,
  alphaWidth: 512,
  alphaHeight: 384,
} as const;

export interface HeavyArmorHangarTextures {
  albedo: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  alpha: THREE.CanvasTexture;
}

export interface HeavyArmorHangarGeometries {
  slab: THREE.BufferGeometry;
  pitRing: THREE.BufferGeometry;
}

export function buildHeavyArmorHangarGeometries(): HeavyArmorHangarGeometries {
  const S = HEAVY_ARMOR_HANGAR_SPEC;
  // Single upward-facing concrete apron plane at Y = topOffsetYCm (eliminates side-wall alpha double-blending)
  const slab = new THREE.PlaneGeometry(S.totalWidthCm, S.totalDepthCm, 1, 1);
  slab.rotateX(-Math.PI / 2);
  slab.translate(0, S.topOffsetYCm, 0);

  // Exact top-down planar UV matching canvas coordinates (+X right, +Z bottom)
  const pos = slab.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = THREE.MathUtils.clamp(
      (pos.getX(i) + S.totalWidthCm * 0.5) / S.totalWidthCm,
      0,
      1
    );
    uv[i * 2 + 1] = THREE.MathUtils.clamp(
      (S.totalDepthCm * 0.5 - pos.getZ(i)) / S.totalDepthCm,
      0,
      1
    );
  }
  slab.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  const pitRing = new THREE.RingGeometry(
    S.turntablePitRadiusCm - 14,
    S.turntablePitRadiusCm + 14,
    160,
    1
  );
  pitRing.rotateX(-Math.PI / 2);
  pitRing.translate(0, S.topOffsetYCm + 0.08, 0);

  return { slab, pitRing };
}

interface HangarOilPatch {
  cxCm: number;
  czCm: number;
  rxCm: number;
  rzCm: number;
  rotRad: number;
  /** Target linear roughness inside the wet oil / condensation core (0.16..0.24) */
  coreRoughness: number;
  albedoDarkOpacity: number;
  lobes: readonly (readonly [dxFrac: number, dzFrac: number, scale: number])[];
}

/** Shared depot hydraulic-oil & condensation slick coordinates aligned identically across albedo, normal & roughness. */
export const HEAVY_ARMOR_OIL_PATCHES: readonly HangarOilPatch[] = [
  {
    cxCm: -352,
    czCm: 52,
    rxCm: 84,
    rzCm: 50,
    rotRad: 0.18,
    coreRoughness: 0.185,
    albedoDarkOpacity: 0.66,
    lobes: [
      [0.0, 0.0, 1.0],
      [-0.44, 0.22, 0.58],
      [0.4, -0.26, 0.5],
    ],
  },
  {
    cxCm: -268,
    czCm: -162,
    rxCm: 62,
    rzCm: 38,
    rotRad: -0.22,
    coreRoughness: 0.195,
    albedoDarkOpacity: 0.6,
    lobes: [
      [0.0, 0.0, 1.0],
      [0.46, 0.16, 0.54],
    ],
  },
  {
    cxCm: 248,
    czCm: 254,
    rxCm: 54,
    rzCm: 32,
    rotRad: 0.14,
    coreRoughness: 0.21,
    albedoDarkOpacity: 0.56,
    lobes: [
      [0.0, 0.0, 1.0],
      [-0.4, -0.2, 0.56],
    ],
  },
  {
    cxCm: -116,
    czCm: -194,
    rxCm: 56,
    rzCm: 34,
    rotRad: 0.3,
    coreRoughness: 0.2,
    albedoDarkOpacity: 0.58,
    lobes: [
      [0.0, 0.0, 1.0],
      [0.34, -0.28, 0.5],
    ],
  },
  {
    cxCm: 318,
    czCm: -178,
    rxCm: 52,
    rzCm: 32,
    rotRad: -0.15,
    coreRoughness: 0.23,
    albedoDarkOpacity: 0.54,
    lobes: [
      [0.0, 0.0, 1.0],
      [-0.36, 0.22, 0.52],
    ],
  },
];

/**
 * Evaluates smooth `[0, 1]` coverage across all multi-lobe hydraulic oil / condensation slicks
 * at deck coordinate `(cmX, cmZ)` so normal micro-pore leveling aligns 1:1 with albedo & roughness.
 */
export function evaluateHangarOilPatchMask(cmX: number, cmZ: number): number {
  let maxMask = 0;
  for (let i = 0; i < HEAVY_ARMOR_OIL_PATCHES.length; i++) {
    const patch = HEAVY_ARMOR_OIL_PATCHES[i];
    const padX = patch.rxCm * 1.65;
    const padZ = patch.rzCm * 1.65;
    if (
      Math.abs(cmX - patch.cxCm) > padX ||
      Math.abs(cmZ - patch.czCm) > padZ
    ) {
      continue;
    }
    const cosR = Math.cos(-patch.rotRad);
    const sinR = Math.sin(-patch.rotRad);
    for (let j = 0; j < patch.lobes.length; j++) {
      const [dxFrac, dzFrac, lobeScale] = patch.lobes[j];
      const lx = patch.cxCm + dxFrac * patch.rxCm;
      const lz = patch.czCm + dzFrac * patch.rzCm;
      const dx = cmX - lx;
      const dz = cmZ - lz;
      const rx = patch.rxCm * lobeScale;
      const rz = patch.rzCm * lobeScale;
      const ux = (dx * cosR - dz * sinR) / rx;
      const uz = (dx * sinR + dz * cosR) / rz;
      const dSq = ux * ux + uz * uz;
      if (dSq < 1) {
        const d = Math.sqrt(dSq);
        const s = 1 - d * d * (3 - 2 * d);
        if (s > maxMask) maxMask = s;
      }
    }
  }
  return maxMask;
}

function hash2dDet(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise2d(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2dDet(ix, iy, seed);
  const b = hash2dDet(ix + 1, iy, seed);
  const c = hash2dDet(ix, iy + 1, seed);
  const d = hash2dDet(ix + 1, iy + 1, seed);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

/**
 * Paints the 2048×1536 1:1 Heavy Armor Concrete Hangar Floor albedo:
 * multi-pour brushed concrete slabs with 3 m expansion joints & corner micro-cracks,
 * weathered/chipped yellow-black hazard bay striping, Ø 9.6 m circular steel turntable pit ring,
 * twin rubber/steel tank track scuff & dust lanes along Z = ±140 cm, organic hydraulic oil stains,
 * and stenciled `HEAVY ARMOR DEPOT · 1:1 METRIC SCALE (0 – 10,000 mm)` ruler.
 */
export function paintHeavyArmorHangarAlbedo(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  preset: ArmoryEnvironmentPreset
): void {
  const S = HEAVY_ARMOR_HANGAR_SPEC;
  const pxPerCmX = w / S.totalWidthCm;
  const pxPerCmZ = h / S.totalDepthCm;
  const toX = (cmX: number) => (cmX + S.totalWidthCm * 0.5) * pxPerCmX;
  const toY = (cmZ: number) => (cmZ + S.totalDepthCm * 0.5) * pxPerCmZ;

  const isLight = preset === 'blueprint_daylight';
  const isBench = preset === 'gunsmith_bench';

  // 1. Brushed concrete base fill
  const baseHex = isLight ? '#c8d1dc' : isBench ? '#2c2b28' : '#232831';
  const jointHex = isLight ? '#8794a5' : isBench ? '#141311' : '#0f1319';
  const inkHex = isLight ? '#1e293b' : '#cbd5e1';
  const mutedInk = isLight ? '#475569' : '#7b8a9e';
  const hazardYellow = isLight ? '#d97706' : '#eab308';
  const hazardBlack = isLight ? '#1e293b' : '#14171c';

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, w, h);

  // Subtle concrete pour-to-pour batch tonal variation across each 3 m × 3 m bay
  const rand = createSeededRandom(0x99a1a2);
  for (let xCm = -1200; xCm < 1200; xCm += S.expansionJointCm) {
    for (let zCm = -900; zCm < 900; zCm += S.expansionJointCm) {
      const shift = (rand() - 0.5) * 2;
      const bright = shift > 0 ? 255 : 0;
      const alpha = Math.abs(shift) * (isLight ? 0.036 : 0.045);
      ctx.fillStyle = `rgba(${bright},${bright},${bright},${alpha.toFixed(4)})`;
      ctx.fillRect(
        toX(xCm),
        toY(zCm),
        S.expansionJointCm * pxPerCmX,
        S.expansionJointCm * pxPerCmZ
      );
    }
  }

  // Deterministic concrete aggregate, trowel streaks & mineral weathering grain
  const grainCount = 5400;
  for (let i = 0; i < grainCount; i++) {
    const gx = rand() * w;
    const gy = rand() * h;
    const gw = 3 + rand() * 32;
    const gh = 1.4 + rand() * 5.2;
    const delta = rand() > 0.48 ? 255 : 0;
    ctx.fillStyle = `rgba(${delta},${delta},${delta},${isLight ? 0.034 : 0.032})`;
    ctx.fillRect(gx, gy, gw, gh);
  }

  // Subtle poured-concrete radial overhead illumination & outer apron darkening
  const floorGrad = ctx.createRadialGradient(
    w * 0.5,
    h * 0.5,
    w * 0.07,
    w * 0.5,
    h * 0.5,
    w * 0.54
  );
  floorGrad.addColorStop(
    0,
    isLight ? 'rgba(255,255,255,0.16)' : 'rgba(186,204,224,0.075)'
  );
  floorGrad.addColorStop(
    0.7,
    isLight ? 'rgba(180,192,206,0.02)' : 'rgba(14,18,24,0.14)'
  );
  floorGrad.addColorStop(
    1,
    isLight ? 'rgba(30,41,59,0.12)' : 'rgba(4,6,10,0.44)'
  );
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Concrete expansion joints every 300 cm (3 m × 3 m slabs) + subtle corner stress cracks
  ctx.save();
  ctx.strokeStyle = jointHex;
  ctx.lineWidth = Math.max(1.5, w * 0.0014);
  for (let xCm = -900; xCm <= 900; xCm += S.expansionJointCm) {
    const px = toX(xCm);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }
  for (let zCm = -600; zCm <= 600; zCm += S.expansionJointCm) {
    const py = toY(zCm);
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
    ctx.stroke();
  }
  // Faint bevel highlight beside each expansion seam
  ctx.strokeStyle = isLight
    ? 'rgba(255,255,255,0.34)'
    : 'rgba(255,255,255,0.055)';
  ctx.lineWidth = 1;
  for (let xCm = -900; xCm <= 900; xCm += S.expansionJointCm) {
    const px = toX(xCm) + 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }
  for (let zCm = -600; zCm <= 600; zCm += S.expansionJointCm) {
    const py = toY(zCm) + 2;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
    ctx.stroke();
  }

  // Deterministic hairline concrete stress cracks near heavy-load joint intersections
  const crackSeeds: readonly (readonly [number, number, number, number])[] = [
    [-600, -300, 0.42, 135],
    [300, -300, 2.52, 118],
    [-300, 300, -0.68, 148],
    [600, 300, -2.35, 110],
    [-600, 300, 0.85, 96],
  ];
  ctx.strokeStyle = isLight ? 'rgba(51,65,85,0.34)' : 'rgba(8,10,14,0.52)';
  ctx.lineWidth = Math.max(1, w * 0.00065);
  for (const [sxCm, szCm, angle, lenCm] of crackSeeds) {
    let cxCm = sxCm;
    let czCm = szCm;
    let ang = angle;
    ctx.beginPath();
    ctx.moveTo(toX(cxCm), toY(czCm));
    const steps = 10;
    for (let k = 0; k < steps; k++) {
      ang += (rand() - 0.5) * 0.48;
      cxCm += Math.cos(ang) * (lenCm / steps);
      czCm += Math.sin(ang) * (lenCm / steps);
      ctx.lineTo(toX(cxCm), toY(czCm));
    }
    ctx.stroke();
  }
  ctx.restore();

  // 3. Twin dark rubber/steel tank-track scuff & mineral dust lanes along Z = ±140 cm
  ctx.save();
  for (const zSign of [-1, 1]) {
    const laneZ = zSign * S.trackLaneZCm;
    const laneY = toY(laneZ);
    const laneH = 66 * pxPerCmZ;

    // Pale dry mineral dust & field grit shed along outer edges of the tank tracks
    const dustH = 98 * pxPerCmZ;
    const dustGrad = ctx.createLinearGradient(toX(-880), 0, toX(580), 0);
    dustGrad.addColorStop(0, 'rgba(155,142,122,0)');
    dustGrad.addColorStop(
      0.18,
      isLight ? 'rgba(116,104,88,0.12)' : 'rgba(162,148,126,0.09)'
    );
    dustGrad.addColorStop(
      0.78,
      isLight ? 'rgba(116,104,88,0.10)' : 'rgba(162,148,126,0.075)'
    );
    dustGrad.addColorStop(1, 'rgba(155,142,122,0)');
    ctx.fillStyle = dustGrad;
    ctx.fillRect(toX(-880), laneY - dustH * 0.5, 1460 * pxPerCmX, dustH);

    // Core dark rubber-pad & blackened track-scuff lane
    const scuffGrad = ctx.createLinearGradient(toX(-860), 0, toX(550), 0);
    scuffGrad.addColorStop(0, 'rgba(8,10,13,0.0)');
    scuffGrad.addColorStop(
      0.16,
      isLight ? 'rgba(22,28,36,0.20)' : 'rgba(5,7,10,0.44)'
    );
    scuffGrad.addColorStop(
      0.76,
      isLight ? 'rgba(22,28,36,0.16)' : 'rgba(5,7,10,0.38)'
    );
    scuffGrad.addColorStop(1, 'rgba(8,10,13,0.0)');
    ctx.fillStyle = scuffGrad;
    ctx.fillRect(toX(-860), laneY - laneH * 0.5, 1410 * pxPerCmX, laneH);

    // Articulated double-block rubber tread impressions & subtle steel grouser scrape marks
    ctx.fillStyle = isLight ? 'rgba(15,23,42,0.11)' : 'rgba(0,0,0,0.26)';
    for (let xCm = -790; xCm <= 390; xCm += 20) {
      const tx = toX(xCm);
      ctx.fillRect(tx, laneY - laneH * 0.4, 7.5 * pxPerCmX, laneH * 0.31);
      ctx.fillRect(
        tx + 3.5 * pxPerCmX,
        laneY + laneH * 0.09,
        7.5 * pxPerCmX,
        laneH * 0.31
      );
    }

    // Fine pale steel grouser abrasion scratches along track centerline & edges
    ctx.strokeStyle = isLight
      ? 'rgba(255,255,255,0.18)'
      : 'rgba(210,220,232,0.075)';
    ctx.lineWidth = Math.max(1, w * 0.0005);
    for (let sIdx = 0; sIdx < 16; sIdx++) {
      const sx0 = -760 + rand() * 1020;
      const slen = 36 + rand() * 125;
      const sy = laneY + (rand() - 0.5) * laneH * 0.85;
      ctx.beginPath();
      ctx.moveTo(toX(sx0), sy);
      ctx.lineTo(toX(sx0 + slen), sy + (rand() - 0.5) * 3);
      ctx.stroke();
    }
  }

  // Organic cool oily charcoal/slate hydraulic stains (exact elliptical taper aligned with normal & roughness)
  for (const patch of HEAVY_ARMOR_OIL_PATCHES) {
    for (const [dxFrac, dzFrac, lobeScale] of patch.lobes) {
      const lx = toX(patch.cxCm + dxFrac * patch.rxCm);
      const ly = toY(patch.czCm + dzFrac * patch.rzCm);
      const lrx = Math.max(1, patch.rxCm * lobeScale * pxPerCmX);
      const lry = Math.max(1, patch.rzCm * lobeScale * pxPerCmZ);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(patch.rotRad);
      ctx.scale(1, lry / lrx);
      const oilGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, lrx);
      const coreA = patch.albedoDarkOpacity * (isLight ? 0.52 : 1.0);
      oilGrad.addColorStop(
        0,
        isLight
          ? `rgba(24,30,38,${coreA.toFixed(3)})`
          : `rgba(5,7,11,${coreA.toFixed(3)})`
      );
      oilGrad.addColorStop(
        0.52,
        isLight
          ? `rgba(34,41,50,${(coreA * 0.56).toFixed(3)})`
          : `rgba(11,15,21,${(coreA * 0.62).toFixed(3)})`
      );
      oilGrad.addColorStop(1, 'rgba(11,15,21,0)');
      ctx.fillStyle = oilGrad;
      ctx.beginPath();
      ctx.arc(0, 0, lrx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();

  // 4. Circular steel turntable pit ring (`Ø 9.6 m`, radius 480 cm)
  const cx = toX(0);
  const cy = toY(0);
  const rxPit = S.turntablePitRadiusCm * pxPerCmX;
  const ryPit = S.turntablePitRadiusCm * pxPerCmZ;

  ctx.save();
  // Dark recessed pit seam & brushed steel rim band
  ctx.strokeStyle = isLight ? '#64748b' : '#475569';
  ctx.lineWidth = Math.max(10, 26 * pxPerCmX);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rxPit, ryPit, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = isLight ? '#334155' : '#090c11';
  ctx.lineWidth = Math.max(2, 4.5 * pxPerCmX);
  ctx.beginPath();
  ctx.ellipse(
    cx,
    cy,
    rxPit - 13 * pxPerCmX,
    ryPit - 13 * pxPerCmZ,
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(
    cx,
    cy,
    rxPit + 13 * pxPerCmX,
    ryPit + 13 * pxPerCmZ,
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  // Turntable azimuth ticks & radial plate joints every 15°
  for (let deg = 0; deg < 360; deg += 15) {
    const a = THREE.MathUtils.degToRad(deg);
    const ca = Math.cos(a);
    const sa = -Math.sin(a);
    const isCardinal = deg % 90 === 0;
    const r0 = isCardinal ? 0.91 : 0.96;
    const r1 = 1.03;
    ctx.strokeStyle = isCardinal ? hazardYellow : mutedInk;
    ctx.lineWidth = isCardinal ? 3.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + ca * rxPit * r0, cy + sa * ryPit * r0);
    ctx.lineTo(cx + ca * rxPit * r1, cy + sa * ryPit * r1);
    ctx.stroke();
  }

  // Center bore / turret datum crosshair
  ctx.strokeStyle = isLight ? 'rgba(30,41,59,0.28)' : 'rgba(148,163,184,0.22)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.moveTo(toX(-760), cy);
  ctx.lineTo(toX(760), cy);
  ctx.moveTo(cx, toY(-480));
  ctx.lineTo(cx, toY(480));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // 5. Realistic Weathered & Chipped Yellow/Black 45° Safety Bay Perimeter Striping (`17.4 m × 11.68 m`)
  ctx.save();
  const bx0 = toX(-870);
  const bx1 = toX(870);
  const by0 = toY(-584);
  const by1 = toY(584);
  const bandW = Math.max(9, 17 * pxPerCmX);

  ctx.beginPath();
  ctx.rect(bx0, by0, bx1 - bx0, by1 - by0);
  ctx.rect(
    bx0 + bandW,
    by0 + bandW,
    bx1 - bx0 - bandW * 2,
    by1 - by0 - bandW * 2
  );
  ctx.clip('evenodd');

  ctx.fillStyle = hazardBlack;
  ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);

  ctx.strokeStyle = hazardYellow;
  ctx.lineWidth = bandW * 0.72;
  const stripeStep = bandW * 1.9;
  for (let d = -h; d < w + h; d += stripeStep) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + h, h);
    ctx.stroke();
  }

  // Paint chipping & concrete wear gouges across the hazard border
  ctx.fillStyle = baseHex;
  for (let i = 0; i < 420; i++) {
    const edge = i % 4;
    let cxChip: number;
    let cyChip: number;
    if (edge === 0) {
      cxChip = bx0 + rand() * (bx1 - bx0);
      cyChip = by0 + rand() * bandW;
    } else if (edge === 1) {
      cxChip = bx0 + rand() * (bx1 - bx0);
      cyChip = by1 - rand() * bandW;
    } else if (edge === 2) {
      cxChip = bx0 + rand() * bandW;
      cyChip = by0 + rand() * (by1 - by0);
    } else {
      cxChip = bx1 - rand() * bandW;
      cyChip = by0 + rand() * (by1 - by0);
    }
    ctx.globalAlpha = 0.38 + rand() * 0.48;
    ctx.fillRect(
      cxChip,
      cyChip,
      (2.5 + rand() * 14) * pxPerCmX,
      (1.8 + rand() * 8) * pxPerCmZ
    );
  }
  // Heavy tank-track crossing wear across the left/right hazard bands at Z = ±140 cm
  ctx.globalAlpha = 0.72;
  for (const zSign of [-1, 1]) {
    const ty = toY(zSign * S.trackLaneZCm);
    const th = 72 * pxPerCmZ;
    ctx.fillRect(bx0 - 2, ty - th * 0.5, bandW + 4, th);
    ctx.fillRect(bx1 - bandW - 2, ty - th * 0.5, bandW + 4, th);
  }
  ctx.restore();

  // 6. Crisp Stenciled 1:1 Metric Scale Ruler (`0 – 10,000 mm`) cleanly outside the Ø 9.6 m steel pit ring
  ctx.save();
  const rulerStartX = toX(-500);
  const rulerEndX = toX(500);
  const rulerY = toY(538);
  ctx.strokeStyle = inkHex;
  ctx.fillStyle = inkHex;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(rulerStartX, rulerY);
  ctx.lineTo(rulerEndX, rulerY);
  ctx.stroke();

  const fontMono = (px: number, weight = 700) =>
    `${weight} ${Math.round(px)}px "JetBrains Mono", "SFMono-Regular", Menlo, monospace`;
  ctx.font = fontMono(11.5, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let mm = 0; mm <= 10000; mm += 200) {
    const xCm = -500 + mm / 10;
    const px = toX(xCm);
    const isMajor = mm % 1000 === 0;
    const tickH = isMajor ? 10 : 5;
    ctx.strokeStyle = isMajor ? hazardYellow : mutedInk;
    ctx.lineWidth = isMajor ? 2.2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(px, rulerY - tickH);
    ctx.lineTo(px, rulerY + (isMajor ? 4 : 2));
    ctx.stroke();

    if (isMajor) {
      ctx.fillStyle = inkHex;
      ctx.fillText(
        mm === 0 ? '0' : `${mm.toLocaleString('en-US')}`,
        px,
        rulerY + 5
      );
    }
  }

  // Primary Depot Stencil Title — cleanly centered between outer pit rim (`Z = +494`) and scale ticks (`Z = +526`)
  ctx.font = fontMono(15, 700);
  ctx.fillStyle = hazardYellow;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    'HEAVY ARMOR DEPOT · 1:1 METRIC SCALE (0 – 10,000 mm)',
    cx,
    toY(521)
  );

  // Rear / Corner Depot Telemetry Stencils (cleanly inside rear safety stripe & outside rear pit rim)
  ctx.font = fontMono(13, 700);
  ctx.fillStyle = mutedInk;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(
    'BAY 1:1 · CONCRETE HANGAR FLOOR · 18,000 × 12,000 mm',
    toX(-820),
    toY(-546)
  );
  ctx.textAlign = 'right';
  ctx.fillText(
    'TURNTABLE PIT Ø 9,600 mm · MAX AXLE LOAD 75,000 KG',
    toX(820),
    toY(-546)
  );

  // Subtle concrete wear flecks over depot stencil paint so lettering integrates organically
  ctx.fillStyle = baseHex;
  for (let i = 0; i < 64; i++) {
    ctx.globalAlpha = 0.22 + rand() * 0.25;
    const sx = toX(-520 + rand() * 1040);
    const sy = toY(508 + rand() * 44);
    ctx.fillRect(sx, sy, 2 + rand() * 6, 1.5 + rand() * 3.5);
  }
  ctx.restore();
}

/**
 * Synthesizes a linear tangent-space normal map (`NoColorSpace`, neutral `(128, 128, 255)`)
 * from a physical 1:1 concrete deck heightfield: troweled aggregate grain, 3 m recessed expansion
 * joint V-grooves with raised lips, Ø 9.6 m recessed turntable pit seams & radial curb plate joints,
 * tank track micro-abrasion lanes (`Z = ±140 cm`), and subtle stress cracks.
 */
export function paintHeavyArmorHangarNormal(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  const S = HEAVY_ARMOR_HANGAR_SPEC;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const heightField = new Float32Array(w * h);

  const invW = 1 / Math.max(1, w);
  const invH = 1 / Math.max(1, h);
  const halfW = S.totalWidthCm * 0.5;
  const halfD = S.totalDepthCm * 0.5;
  const jointStep = S.expansionJointCm;
  const pitR = S.turntablePitRadiusCm;

  for (let py = 0; py < h; py++) {
    const cmZ = (py + 0.5) * invH * S.totalDepthCm - halfD;
    const rowOff = py * w;

    // Distance to nearest Z expansion seam (every 300 cm)
    const modZ = ((cmZ % jointStep) + jointStep) % jointStep;
    const distZ = Math.min(modZ, jointStep - modZ);

    // Track lane proximity (Z = ±140 cm, width ±33 cm)
    const trackDist = Math.abs(Math.abs(cmZ) - S.trackLaneZCm);
    const inTrackBandZ = trackDist < 34;

    for (let px = 0; px < w; px++) {
      const cmX = (px + 0.5) * invW * S.totalWidthCm - halfW;

      // 1. Multi-octave troweled concrete micro-relief (smoothly self-leveled inside oil slick lobes)
      const oilMask = evaluateHangarOilPatchMask(cmX, cmZ);
      const poreAtten = 1 - oilMask * 0.98;
      const nCoarse = valueNoise2d(cmX * 0.014, cmZ * 0.014, 17);
      const nMid = valueNoise2d(cmX * 0.075, cmZ * 0.075, 53);
      const nFine = hash2dDet(px, py, 109);
      let elev =
        ((nCoarse - 0.5) * 0.24 +
          (nMid - 0.5) * 0.13 +
          (nFine - 0.5) * 0.045) *
        poreAtten;

      // 2. Concrete 3 m × 3 m expansion joint V-grooves with slight troweled edge lip
      const modX = ((cmX % jointStep) + jointStep) % jointStep;
      const distX = Math.min(modX, jointStep - modX);
      const seamDist = Math.min(distX, distZ);
      if (seamDist < 7.5) {
        if (seamDist < 2.6) {
          const t = seamDist / 2.6;
          elev -= (1 - t * t) * 1.15;
        } else {
          const lipT = (seamDist - 2.6) / 4.9;
          elev += Math.sin(lipT * Math.PI) * 0.16;
        }
      }

      // 3. Recessed Ø 9.6 m steel turntable pit ring seams, proud curb & 24 radial plate joints
      const r = Math.hypot(cmX, cmZ);
      const dInnerSeam = Math.abs(r - (pitR - 13.5));
      const dOuterSeam = Math.abs(r - (pitR + 13.5));
      if (dInnerSeam < 3.6) {
        elev -= (1 - dInnerSeam / 3.6) * 1.45;
      } else if (dOuterSeam < 3.6) {
        elev -= (1 - dOuterSeam / 3.6) * 1.45;
      } else if (r > pitR - 12 && r < pitR + 12) {
        elev += 0.34;
        // 24 radial steel curb plate joints every 15°
        const ang = Math.atan2(cmZ, cmX);
        const sectorRad = Math.PI / 12;
        const modAng = ((ang % sectorRad) + sectorRad) % sectorRad;
        const distAng = Math.min(modAng, sectorRad - modAng) * r;
        if (distAng < 2.2) {
          elev -= (1 - distAng / 2.2) * 0.55;
        }
      }

      // 4. Subtle steel-grouser & rubber tread pitting along twin tank track lanes
      if (inTrackBandZ && cmX > -840 && cmX < 520) {
        const treadWave = Math.sin(cmX * (Math.PI / 10));
        const laneFade = 1 - trackDist / 34;
        elev -= Math.max(0, treadWave) * 0.08 * laneFade * poreAtten;
      }

      heightField[rowOff + px] = elev;
    }
  }

  // Sobel / central-difference gradient -> tangent-space normal (+X right, +V = -Z up)
  const strength = 2.15;
  for (let py = 0; py < h; py++) {
    const yPrev = Math.max(0, py - 1) * w;
    const yCur = py * w;
    const yNext = Math.min(h - 1, py + 1) * w;

    for (let px = 0; px < w; px++) {
      const xPrev = Math.max(0, px - 1);
      const xNext = Math.min(w - 1, px + 1);

      const dhDx = (heightField[yCur + xNext] - heightField[yCur + xPrev]) * 0.5;
      const dhDy = (heightField[yNext + px] - heightField[yPrev + px]) * 0.5;

      const nx = -dhDx * strength;
      const ny = dhDy * strength;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);

      const idx = (yCur + px) * 4;
      data[idx] = Math.max(
        0,
        Math.min(255, Math.round((nx * invLen * 0.5 + 0.5) * 255))
      );
      data[idx + 1] = Math.max(
        0,
        Math.min(255, Math.round((ny * invLen * 0.5 + 0.5) * 255))
      );
      data[idx + 2] = Math.max(
        0,
        Math.min(255, Math.round((nz * invLen * 0.5 + 0.5) * 255))
      );
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
}

/**
 * Paints the 1024×768 linear roughness map (`NoColorSpace`) for the Heavy Armor concrete deck:
 * rough troweled concrete (`R ~ 0.86..0.94`), burnished rubber/dust tank tracks (`R ~ 0.74..0.82`),
 * weathered hazard epoxy paint (`R ~ 0.60..0.68`), brushed steel pit ring (`R ~ 0.38..0.44`),
 * and glossy low-roughness hydraulic oil & condensation slicks (`R ~ 0.16..0.24`).
 */
export function paintHeavyArmorHangarRoughness(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  const S = HEAVY_ARMOR_HANGAR_SPEC;
  const pxPerCmX = w / S.totalWidthCm;
  const pxPerCmZ = h / S.totalDepthCm;
  const toX = (cmX: number) => (cmX + S.totalWidthCm * 0.5) * pxPerCmX;
  const toY = (cmZ: number) => (cmZ + S.totalDepthCm * 0.5) * pxPerCmZ;

  // Rough troweled concrete base (~0.90 = 230/255, spanning 0.86..0.94)
  ctx.fillStyle = 'rgb(230,230,230)';
  ctx.fillRect(0, 0, w, h);

  const rand = createSeededRandom(0x7051);
  for (let i = 0; i < 2200; i++) {
    const v = Math.round(219 + rand() * 22); // 0.86 .. 0.945
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(rand() * w, rand() * h, 4 + rand() * 20, 2 + rand() * 6);
  }

  // Rough recessed concrete expansion joints (~0.96)
  ctx.strokeStyle = 'rgb(245,245,245)';
  ctx.lineWidth = Math.max(1.5, w * 0.002);
  for (let xCm = -900; xCm <= 900; xCm += S.expansionJointCm) {
    ctx.beginPath();
    ctx.moveTo(toX(xCm), 0);
    ctx.lineTo(toX(xCm), h);
    ctx.stroke();
  }
  for (let zCm = -600; zCm <= 600; zCm += S.expansionJointCm) {
    ctx.beginPath();
    ctx.moveTo(0, toY(zCm));
    ctx.lineTo(w, toY(zCm));
    ctx.stroke();
  }

  // Twin tank track scuff lanes along Z = ±140 cm (slightly burnished rubber track ~0.76)
  for (const zSign of [-1, 1]) {
    const laneY = toY(zSign * S.trackLaneZCm);
    const laneH = 64 * pxPerCmZ;
    const trkGrad = ctx.createLinearGradient(toX(-860), 0, toX(550), 0);
    trkGrad.addColorStop(0, 'rgba(192,192,192,0)');
    trkGrad.addColorStop(0.2, 'rgba(192,192,192,0.52)');
    trkGrad.addColorStop(0.75, 'rgba(198,198,198,0.46)');
    trkGrad.addColorStop(1, 'rgba(192,192,192,0)');
    ctx.fillStyle = trkGrad;
    ctx.fillRect(toX(-860), laneY - laneH * 0.5, 1410 * pxPerCmX, laneH);
  }

  // Semi-matte industrial epoxy safety border (~0.64)
  const bx0 = toX(-870);
  const bx1 = toX(870);
  const by0 = toY(-584);
  const by1 = toY(584);
  const bandW = Math.max(6, 17 * pxPerCmX);
  ctx.strokeStyle = 'rgb(164,164,164)';
  ctx.lineWidth = bandW;
  ctx.strokeRect(
    bx0 + bandW * 0.5,
    by0 + bandW * 0.5,
    bx1 - bx0 - bandW,
    by1 - by0 - bandW
  );

  // Smoother brushed steel turntable pit ring (~0.40)
  ctx.strokeStyle = 'rgb(102,102,102)';
  ctx.lineWidth = Math.max(6, 26 * pxPerCmX);
  ctx.beginPath();
  ctx.ellipse(
    toX(0),
    toY(0),
    S.turntablePitRadiusCm * pxPerCmX,
    S.turntablePitRadiusCm * pxPerCmZ,
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  // Low-roughness hydraulic oil & condensation slick patches (`R ~ 0.18..0.24`, tight glossy puddle core)
  for (const patch of HEAVY_ARMOR_OIL_PATCHES) {
    const coreByte = Math.max(
      44,
      Math.min(72, Math.round(patch.coreRoughness * 255))
    );
    const midByte = Math.min(182, coreByte + 76);
    const rimByte = 204;
    for (const [dxFrac, dzFrac, lobeScale] of patch.lobes) {
      const lx = toX(patch.cxCm + dxFrac * patch.rxCm);
      const ly = toY(patch.czCm + dzFrac * patch.rzCm);
      const lrx = Math.max(1, patch.rxCm * lobeScale * pxPerCmX);
      const lry = Math.max(1, patch.rzCm * lobeScale * pxPerCmZ);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(patch.rotRad);
      ctx.scale(1, lry / lrx);
      const oilGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, lrx);
      oilGrad.addColorStop(0, `rgb(${coreByte},${coreByte},${coreByte})`);
      oilGrad.addColorStop(0.36, `rgb(${midByte},${midByte},${midByte})`);
      oilGrad.addColorStop(0.72, `rgb(${rimByte},${rimByte},${rimByte})`);
      oilGrad.addColorStop(1, 'rgba(230,230,230,0)');
      ctx.fillStyle = oilGrad;
      ctx.beginPath();
      ctx.arc(0, 0, lrx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

/**
 * Paints the smooth rounded-rectangle alpha feather mask (`NoColorSpace` linear) so the
 * 18 m × 12 m active Heavy Armor bay stays 100% opaque (`255`) while the outer 2.6 m concrete
 * apron dissolves organically (`255 -> 0`) into the dark hangar background & fog with zero
 * visible rectangular floating slab edge.
 */
export function paintHeavyArmorHangarAlpha(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  const S = HEAVY_ARMOR_HANGAR_SPEC;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  // Inner full-opacity rounded rect encloses the entire 18 m × 12 m marked bay & hazard stripes
  const innerHalfX = S.widthCm * 0.5 + 15; // 915 cm
  const innerHalfZ = S.depthCm * 0.5 + 8; // 608 cm
  const cornerR = 175;
  const featherWidth = Math.max(120, S.featherMarginCm - 32); // ~228 cm smooth C2 dissolve

  const invW = 1 / Math.max(1, w);
  const invH = 1 / Math.max(1, h);
  const halfTotalW = S.totalWidthCm * 0.5;
  const halfTotalD = S.totalDepthCm * 0.5;

  for (let py = 0; py < h; py++) {
    const cmZ = (py + 0.5) * invH * S.totalDepthCm - halfTotalD;
    const edgeGuardY =
      py === 0 || py === h - 1 ? 0 : 1;
    const rowOff = py * w;

    for (let px = 0; px < w; px++) {
      const idx = (rowOff + px) * 4;
      if (edgeGuardY === 0 || px === 0 || px === w - 1) {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 255;
        continue;
      }

      const cmX = (px + 0.5) * invW * S.totalWidthCm - halfTotalW;

      // Exact 2D rounded-box SDF (<= 0 inside full-opacity bay, > 0 inside feather skirt)
      const qx = Math.abs(cmX) - (innerHalfX - cornerR);
      const qz = Math.abs(cmZ) - (innerHalfZ - cornerR);
      const outDist = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
      const inDist = Math.min(Math.max(qx, qz), 0);
      const sdf = outDist + inDist - cornerR;

      // Subtle low-frequency organic concrete shadow modulation along the fade skirt
      const wobble = (valueNoise2d(cmX * 0.0085, cmZ * 0.0085, 311) - 0.5) * 34;
      const t = THREE.MathUtils.clamp((sdf + wobble) / featherWidth, 0, 1);
      // C2 quintic Hermite falloff: zero derivative at both 0 and 1 for invisible seam transition
      const quintic = t * t * t * (t * (t * 6 - 15) + 10);
      let alpha = 1 - quintic;

      // Guarantee absolute zero taper at the very outer 28 cm geometric perimeter
      const marginX = halfTotalW - Math.abs(cmX);
      const marginZ = halfTotalD - Math.abs(cmZ);
      const edgeT = THREE.MathUtils.clamp(Math.min(marginX, marginZ) / 28, 0, 1);
      alpha *= edgeT * edgeT * (3 - 2 * edgeT);

      const byte = Math.max(0, Math.min(255, Math.round(alpha * 255)));
      data[idx] = byte;
      data[idx + 1] = byte;
      data[idx + 2] = byte;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
}

const hangarAlbedoCache = new Map<ArmoryEnvironmentPreset, THREE.CanvasTexture>();
let hangarNormalTexture: THREE.CanvasTexture | null = null;
let hangarRoughnessTexture: THREE.CanvasTexture | null = null;
let hangarAlphaTexture: THREE.CanvasTexture | null = null;

/**
 * Lazily paints & caches the Heavy Armor Hangar Floor PBR + Alpha suite:
 * 2048×1536 sRGB Albedo (per preset) + shared 1024×768 linear Normal,
 * 1024×768 linear Roughness, and 512×384 linear feathered Alpha map.
 */
export function getHeavyArmorHangarTextures(
  preset: ArmoryEnvironmentPreset
): HeavyArmorHangarTextures | null {
  if (!canCreateCanvasTextures()) return null;
  let albedo = hangarAlbedoCache.get(preset);
  if (!albedo) {
    const c = createCanvas2d(
      HEAVY_ARMOR_HANGAR_TEXTURE_SIZE.albedoWidth,
      HEAVY_ARMOR_HANGAR_TEXTURE_SIZE.albedoHeight
    );
    if (!c) return null;
    paintHeavyArmorHangarAlbedo(c.ctx, c.canvas.width, c.canvas.height, preset);
    albedo = finishTexture(c.canvas, THREE.SRGBColorSpace);
    albedo.name = `HeavyArmorHangar.albedo.${preset}`;
    hangarAlbedoCache.set(preset, albedo);
  }
  if (!hangarNormalTexture) {
    const c = createCanvas2d(
      HEAVY_ARMOR_HANGAR_TEXTURE_SIZE.normalWidth,
      HEAVY_ARMOR_HANGAR_TEXTURE_SIZE.normalHeight
    );
    if (!c) return null;
    paintHeavyArmorHangarNormal(c.ctx, c.canvas.width, c.canvas.height);
    hangarNormalTexture = finishTexture(c.canvas, THREE.NoColorSpace);
    hangarNormalTexture.name = 'HeavyArmorHangar.normal';
  }
  if (!hangarRoughnessTexture) {
    const c = createCanvas2d(
      HEAVY_ARMOR_HANGAR_TEXTURE_SIZE.roughnessWidth,
      HEAVY_ARMOR_HANGAR_TEXTURE_SIZE.roughnessHeight
    );
    if (!c) return null;
    paintHeavyArmorHangarRoughness(c.ctx, c.canvas.width, c.canvas.height);
    hangarRoughnessTexture = finishTexture(c.canvas, THREE.NoColorSpace);
    hangarRoughnessTexture.name = 'HeavyArmorHangar.roughness';
  }
  if (!hangarAlphaTexture) {
    const c = createCanvas2d(
      HEAVY_ARMOR_HANGAR_TEXTURE_SIZE.alphaWidth,
      HEAVY_ARMOR_HANGAR_TEXTURE_SIZE.alphaHeight
    );
    if (!c) return null;
    paintHeavyArmorHangarAlpha(c.ctx, c.canvas.width, c.canvas.height);
    hangarAlphaTexture = finishTexture(c.canvas, THREE.NoColorSpace);
    hangarAlphaTexture.name = 'HeavyArmorHangar.alpha';
  }
  return {
    albedo,
    normal: hangarNormalTexture,
    roughness: hangarRoughnessTexture,
    alpha: hangarAlphaTexture,
  };
}

// =====================================================================================
// 6. R3F components
// =====================================================================================

const noopRaycast: THREE.Object3D['raycast'] = () => {};

export interface KeyLightShadowConfig {
  mapSize: number;
  position: Vec3;
  radius: number;
  bias: number;
  normalBias: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

/**
 * Resolves physically tuned key-light directional shadow parameters per weapon scale & graphics tier:
 * - Main Battle Tanks (`1:1` 10-meter hull + 125mm/120mm gun): `4096×4096` Ultra (`2048×2048` Balanced/Eco),
 *   tight frustum `±560 × ±400 cm` (`2.7 mm` texel pitch at Ultra!) with dialed bias/normalBias so barrels,
 *   antennas, ERA brackets, and smoke dischargers cast razor-sharp self-shadows with zero acne.
 * - Firearms & Archery: preserves existing `2048/1024` tabletop frustum (`±60 × ±44 cm`).
 */
export function resolveKeyLightShadowConfig(
  scaleProfile: WeaponScaleProfile,
  graphicsQuality: GraphicsQualityTier = 'ultra',
  baseKeyPosition: Vec3 = [14, 46, 28],
  fallbackMapSize?: number
): KeyLightShadowConfig {
  if (scaleProfile === 'main_battle_tank') {
    const isUltra = graphicsQuality === 'ultra';
    return {
      mapSize: isUltra ? 4096 : 2048,
      position: [520, 770, 620],
      radius: isUltra ? 2.0 : 2.4,
      bias: isUltra ? -0.00018 : -0.00024,
      normalBias: isUltra ? 0.16 : 0.26,
      left: -560,
      right: 560,
      top: 400,
      bottom: -400,
      near: 250,
      far: 2100,
    };
  }
  return {
    mapSize: fallbackMapSize ?? (graphicsQuality === 'ultra' ? 2048 : 1024),
    position: baseKeyPosition,
    radius: 3.5,
    bias: -0.00022,
    normalBias: 0.018,
    left: -60,
    right: 60,
    top: 44,
    bottom: -44,
    near: 1,
    far: 180,
  };
}

export interface ArmoryStudioEnvironmentProps {
  preset?: ArmoryEnvironmentPreset;
  scaleProfile?: WeaponScaleProfile;
  graphicsQuality?: GraphicsQualityTier;
  shadowMapSize?: number;
  contextEpoch?: number;
}

const STUDIO_BACKDROP_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STUDIO_BACKDROP_FRAGMENT = /* glsl */ `
  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uNadirColor;
  varying vec3 vDir;
  void main() {
    float y = clamp(vDir.y, -1.0, 1.0);
    // Soft commercial tabletop studio cyclorama glow around eye-level horizon, gently vignetting overhead & floor
    float horizonBand = exp(-pow((y - 0.04) / 0.34, 2.0));
    vec3 baseCol = mix(uNadirColor, uZenithColor, smoothstep(-0.35, 0.55, y));
    vec3 col = mix(baseCol, uHorizonColor, horizonBand * 0.88);
    // Subtle studio backlight bloom behind center so dark steel silhouettes cleanly separate from backdrop
    float radialSpot = exp(-pow(abs(vDir.x) * 1.15, 2.0)) * horizonBand;
    col += (uHorizonColor - baseCol) * radialSpot * 0.22;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Drop-in background + fog + lights + photographic Cycles HDRI reflection dome for a preset.
 * Automatically binds the 1:1 Heavy Armor Assembly Hangar HDRI for Main Battle Tanks on dark presets
 * and falls back cleanly to procedural Lightformers while `.hdr` streams in or in headless tests.
 */
export const ArmoryStudioEnvironment: React.FC<ArmoryStudioEnvironmentProps> =
  React.memo(
    ({
      preset = DEFAULT_ARMORY_ENVIRONMENT,
      scaleProfile = 'rifle',
      graphicsQuality,
      shadowMapSize = 2048,
      contextEpoch = 0,
    }) => {
      const env = getArmoryEnvironment(preset);
      const isTank = scaleProfile === 'main_battle_tank';
      const lightScale = isTank ? 10 : 1;
      const resolvedQuality: GraphicsQualityTier =
        graphicsQuality ?? (shadowMapSize >= 2048 ? 'ultra' : 'balanced');
      const shadowCfg = useMemo(
        () =>
          resolveKeyLightShadowConfig(
            scaleProfile,
            resolvedQuality,
            env.keyLight.position,
            shadowMapSize
          ),
        [scaleProfile, resolvedQuality, env.keyLight.position, shadowMapSize]
      );
      const targetHdriKey = getStudioHdriFileNameForScale(preset, scaleProfile);
      const keyLightRef = useRef<THREE.DirectionalLight>(null);
      const { gl, scene } = useThree();
      const [hdriReadyKey, setHdriReadyKey] = useState<string | null>(null);

      // Update shadow camera frustum, bias & GPU shadow-map allocation whenever scale or quality changes
      useEffect(() => {
        const key = keyLightRef.current;
        if (!key) return;
        const cam = key.shadow.camera;
        cam.left = shadowCfg.left;
        cam.right = shadowCfg.right;
        cam.top = shadowCfg.top;
        cam.bottom = shadowCfg.bottom;
        cam.near = shadowCfg.near;
        cam.far = shadowCfg.far;
        cam.updateProjectionMatrix();

        key.shadow.bias = shadowCfg.bias;
        key.shadow.normalBias = shadowCfg.normalBias;
        key.shadow.radius = shadowCfg.radius;
        if (
          key.shadow.mapSize.x !== shadowCfg.mapSize ||
          key.shadow.mapSize.y !== shadowCfg.mapSize
        ) {
          key.shadow.mapSize.set(shadowCfg.mapSize, shadowCfg.mapSize);
          if (key.shadow.map) {
            key.shadow.map.dispose();
            key.shadow.map = null;
          }
        }
        key.shadow.needsUpdate = true;
      }, [shadowCfg]);

      const backdropGeo = useMemo(
        () => new THREE.SphereGeometry(380, 32, 20),
        []
      );
      const backdropMat = useMemo(
        () =>
          new THREE.ShaderMaterial({
            vertexShader: STUDIO_BACKDROP_VERTEX,
            fragmentShader: STUDIO_BACKDROP_FRAGMENT,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            uniforms: {
              uZenithColor: { value: new THREE.Color('#090b0f') },
              uHorizonColor: { value: new THREE.Color('#1c2026') },
              uNadirColor: { value: new THREE.Color('#080a0d') },
            },
          }),
        []
      );

      useEffect(() => {
        if (preset === 'tactical_vault') {
          backdropMat.uniforms.uZenithColor.value.set(
            isTank ? '#080b10' : '#090b0e'
          );
          backdropMat.uniforms.uHorizonColor.value.set(
            isTank ? '#181e27' : '#1e2228'
          );
          backdropMat.uniforms.uNadirColor.value.set(
            isTank ? '#090c11' : '#08090c'
          );
        } else if (preset === 'gunsmith_bench') {
          backdropMat.uniforms.uZenithColor.value.set('#0d0e11');
          backdropMat.uniforms.uHorizonColor.value.set(
            isTank ? '#211f1b' : '#25221e'
          );
          backdropMat.uniforms.uNadirColor.value.set('#0b0c0e');
        } else {
          backdropMat.uniforms.uZenithColor.value.set('#d4dde9');
          backdropMat.uniforms.uHorizonColor.value.set('#edf2f8');
          backdropMat.uniforms.uNadirColor.value.set('#ced8e5');
        }
      }, [preset, isTank, backdropMat]);

      useEffect(
        () => () => {
          backdropGeo.dispose();
          backdropMat.dispose();
        },
        [backdropGeo, backdropMat]
      );

      useEffect(() => {
        let cancelled = false;
        void loadStudioHdriTexture(gl, preset, scaleProfile).then((tex) => {
          if (cancelled) return;
          if (tex) {
            scene.environment = tex;
            if ('environmentIntensity' in scene) {
              (
                scene as THREE.Scene & { environmentIntensity: number }
              ).environmentIntensity = getStudioHdriEnvIntensityForScale(
                preset,
                scaleProfile
              );
            }
            setHdriReadyKey(targetHdriKey);
          } else {
            setHdriReadyKey(null);
          }
        });
        return () => {
          cancelled = true;
        };
      }, [gl, scene, preset, scaleProfile, targetHdriKey, contextEpoch]);

      const useFallbackLightformers = hdriReadyKey !== targetHdriKey;
      const scaleLightPos = (p: Vec3): [number, number, number] => [
        p[0] * lightScale,
        p[1] * lightScale,
        p[2] * lightScale,
      ];

      return (
        <>
          <color attach="background" args={[env.background]} />
          <fog
            attach="fog"
            args={[
              env.fog.color,
              isTank ? 3600 : env.fog.near,
              isTank ? 5400 : env.fog.far,
            ]}
          />
          <mesh
            geometry={backdropGeo}
            material={backdropMat}
            scale={isTank ? 4200 / 380 : 1}
            renderOrder={-100}
            frustumCulled={false}
            raycast={noopRaycast}
            userData={{ excludeFromGtao: true }}
            name="studio-cyclorama-backdrop"
          />
          <ambientLight
            intensity={env.ambient.intensity * (isTank ? 0.62 : 1)}
            color={env.ambient.color}
          />
          <hemisphereLight
            args={[
              env.hemisphere.skyColor,
              env.hemisphere.groundColor,
              env.hemisphere.intensity * (isTank ? 0.74 : 1),
            ]}
            position={[0, 30 * lightScale, 0]}
          />
          <directionalLight
            ref={keyLightRef}
            position={
              shadowCfg.position as [number, number, number]
            }
            intensity={env.keyLight.intensity * (isTank ? 1.24 : 1)}
            color={env.keyLight.color}
            castShadow
            shadow-mapSize={[shadowCfg.mapSize, shadowCfg.mapSize]}
            shadow-radius={shadowCfg.radius}
            shadow-bias={shadowCfg.bias}
            shadow-normalBias={shadowCfg.normalBias}
            shadow-camera-left={shadowCfg.left}
            shadow-camera-right={shadowCfg.right}
            shadow-camera-top={shadowCfg.top}
            shadow-camera-bottom={shadowCfg.bottom}
            shadow-camera-near={shadowCfg.near}
            shadow-camera-far={shadowCfg.far}
          />
          <directionalLight
            position={scaleLightPos(env.rimLight.position)}
            intensity={env.rimLight.intensity * (isTank ? 1.16 : 1)}
            color={env.rimLight.color}
          />
          <directionalLight
            position={scaleLightPos(env.fillLight.position)}
            intensity={env.fillLight.intensity * (isTank ? 0.64 : 1)}
            color={env.fillLight.color}
          />
          <directionalLight
            position={scaleLightPos(env.topLight.position)}
            intensity={env.topLight.intensity * (isTank ? 0.62 : 1)}
            color={env.topLight.color}
          />
          <directionalLight
            position={scaleLightPos(env.underLight.position)}
            intensity={env.underLight.intensity * (isTank ? 0.48 : 1)}
            color={env.underLight.color}
          />
          {/* Immediate procedural fallback while 32-bit Cycles .hdr streams in; unmounted once HDRI binds */}
          {useFallbackLightformers && (
            <Environment key={preset} resolution={512}>
              <color attach="background" args={[env.environmentBackground]} />
              {env.lightformers.map((lf, i) => (
                <Lightformer
                  key={i}
                  form={lf.form ?? 'rect'}
                  intensity={lf.intensity}
                  color={lf.color}
                  position={lf.position as [number, number, number]}
                  scale={[lf.scale[0], lf.scale[1], 1]}
                  {...(lf.rotation
                    ? { rotation: lf.rotation as [number, number, number] }
                    : { target: [0, 0, 0] as [number, number, number] })}
                />
              ))}
            </Environment>
          )}
        </>
      );
    }
  );

ArmoryStudioEnvironment.displayName = 'ArmoryStudioEnvironment';

const STUDIO_FLOOR_GRID_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const STUDIO_FLOOR_GRID_FRAGMENT = /* glsl */ `
  uniform vec3 uCellColor;
  uniform vec3 uSectionColor;
  uniform vec3 uCycloramaColor;
  uniform vec2 uCenterXZ;
  uniform float uFadeDistance;
  uniform float uLineOpacity;
  uniform float uCycloramaSheen;
  uniform float uGridScale;

  varying vec3 vWorldPos;

  float sampleCrispAxisGrid(vec2 coord, float stepCm, float thicknessPx) {
    vec2 r = coord / stepCm;
    vec2 fw = max(fwidth(r), vec2(1e-4));
    vec2 distPx = abs(fract(r - 0.5) - 0.5) / fw;
    // Fade lines out cleanly before grazing spacing approaches 2px to prevent moire gray sheets
    vec2 nyquistFade = 1.0 - smoothstep(0.16, 0.40, fw);
    vec2 lineMask = (1.0 - min(distPx + 1.0 - thicknessPx, 1.0)) * nyquistFade;
    return max(lineMask.x, lineMask.y);
  }

  void main() {
    vec2 relXZ = vWorldPos.xz - uCenterXZ;
    float radialDist = length(relXZ);
    if (radialDist >= uFadeDistance) discard;

    float radialNorm = clamp(radialDist / max(uFadeDistance, 1.0), 0.0, 1.0);
    float radialFade = pow(1.0 - smoothstep(0.0, 1.0, radialNorm), 1.65);

    // Smooth grazing-angle horizon fade from active camera (eliminates mid-frame horizon bands)
    vec3 viewVec = cameraPosition - vWorldPos;
    float sinElev = abs(viewVec.y) / max(length(viewVec), 1e-3);
    float horizonFade = smoothstep(0.10, 0.34, sinElev);

    float gs = max(uGridScale, 0.5);
    float gMinor = sampleCrispAxisGrid(relXZ, 2.0 * gs, 0.55) * 0.65;
    float gMajor = sampleCrispAxisGrid(relXZ, 10.0 * gs, 0.95);
    float gridMask = clamp(max(gMinor, gMajor), 0.0, 1.0);

    vec3 gridRgb = mix(uCellColor, uSectionColor, clamp(gMajor, 0.0, 1.0));
    float gridAlpha = gridMask * radialFade * horizonFade * uLineOpacity;

    // Seamless radial studio cyclorama floor blend matching the daylight backdrop
    float cycAlpha = radialFade * horizonFade * uCycloramaSheen;
    float outAlpha = clamp(gridAlpha + cycAlpha * (1.0 - gridAlpha), 0.0, 1.0);
    if (outAlpha <= 0.0015) discard;

    vec3 outRgb = mix(uCycloramaColor, gridRgb, gridAlpha / max(outAlpha, 1e-4));
    gl_FragColor = vec4(outRgb, outAlpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface GunsmithStageMatProps {
  preset?: ArmoryEnvironmentPreset;
  scaleProfile?: WeaponScaleProfile;
  /** World-space X of the mat centre (the printed bore datum crosshair sits here). */
  centerX?: number;
  /** Soft real-time contact shadow pooled on the mat surface beneath the firearm */
  contactShadows?: boolean;
  /** Shadow texture resolution for ContactShadows (512 on Ultra, 256 on Balanced) */
  contactShadowResolution?: number;
  /** Radial cyclorama studio floor grid surrounding the mat */
  showGrid?: boolean;
}

/**
 * Workbench: 1:1 neoprene armorer's takedown mat (small arms) OR 1:1 18m × 12m Heavy Armor
 * concrete hangar deck (Main Battle Tanks). Showcase/Armory: seamless radial cyclorama studio
 * floor grid tracking the turntable's `gridFloorY` envelope with zero horizon seam.
 */
export const GunsmithStageMat: React.FC<GunsmithStageMatProps> = React.memo(
  ({
    preset = DEFAULT_ARMORY_ENVIRONMENT,
    scaleProfile,
    centerX = 0,
    contactShadows = true,
    contactShadowResolution = 512,
    showGrid = true,
  }) => {
    const groupRef = useRef<THREE.Group>(null);
    const screen = useAppStore((s) => s.screen);
    const activeWeaponId = useAppStore((s) => s.activeWeaponId);
    const env = getArmoryEnvironment(preset);
    const resolvedScaleProfile =
      scaleProfile ?? getWeaponManifest(activeWeaponId).workbenchMeta.scaleProfile;
    const isTank =
      resolvedScaleProfile === 'main_battle_tank' && screen !== 'cartridges';

    const geos = useMemo(() => buildTakedownMatGeometries(), []);
    const hangarGeos = useMemo(() => buildHeavyArmorHangarGeometries(), []);
    const floorGeo = useMemo(() => {
      const plane = new THREE.PlaneGeometry(340, 340, 1, 1);
      plane.rotateX(-Math.PI / 2);
      return plane;
    }, []);
    const floorMat = useMemo(
      () =>
        new THREE.ShaderMaterial({
          vertexShader: STUDIO_FLOOR_GRID_VERTEX,
          fragmentShader: STUDIO_FLOOR_GRID_FRAGMENT,
          transparent: true,
          depthWrite: false,
          side: THREE.FrontSide,
          uniforms: {
            uCellColor: { value: new THREE.Color('#18212c') },
            uSectionColor: { value: new THREE.Color('#2a3748') },
            uCycloramaColor: { value: new THREE.Color('#e3eaf3') },
            uCenterXZ: { value: new THREE.Vector2(0, 0) },
            uFadeDistance: { value: 135 },
            uLineOpacity: { value: 0.72 },
            uCycloramaSheen: { value: 0 },
            uGridScale: { value: 1.0 },
          },
        }),
      []
    );

    useEffect(() => {
      const isLight = env.tone === 'light';
      floorMat.uniforms.uCellColor.value.set(env.grid.cellColor);
      floorMat.uniforms.uSectionColor.value.set(env.grid.sectionColor);
      floorMat.uniforms.uCycloramaColor.value.set(
        isLight ? '#e4ebf4' : env.background
      );
      floorMat.uniforms.uFadeDistance.value = isTank
        ? 2400
        : env.grid.fadeDistance;
      floorMat.uniforms.uGridScale.value = isTank ? 25.0 : 1.0;
      // Restrained dark studio cyclorama lines keep focus on the real steel silhouette
      floorMat.uniforms.uLineOpacity.value = isLight
        ? 0.24
        : preset === 'tactical_vault'
          ? 0.18
          : 0.28;
      floorMat.uniforms.uCycloramaSheen.value = isLight ? 0.24 : 0.16;
      floorMat.uniforms.uCenterXZ.value.set(centerX, 0);
    }, [env, preset, centerX, isTank, floorMat]);

    useEffect(
      () => () => {
        geos.slab.dispose();
        geos.lip.dispose();
        geos.trayFloor.dispose();
        hangarGeos.slab.dispose();
        hangarGeos.pitRing.dispose();
        floorGeo.dispose();
        floorMat.dispose();
      },
      [geos, hangarGeos, floorGeo, floorMat]
    );

    // Module-cached textures (shared across mounts; never disposed per unmount)
    const textures = useMemo(() => getGunsmithMatTextures(preset), [preset]);
    const hangarTextures = useMemo(
      () => (isTank ? getHeavyArmorHangarTextures(preset) : null),
      [isTank, preset]
    );
    const hangarNormalScale = useMemo(() => new THREE.Vector2(0.75, 0.75), []);

    useFrame(() => {
      const g = groupRef.current;
      if (!g) return;
      const st = useAppStore.getState();
      if (st.screen === 'workbench') {
        const meta = getWeaponManifest(st.activeWeaponId).workbenchMeta;
        g.position.y = meta.gridY;
        floorMat.uniforms.uCenterXZ.value.x = meta.chamberGlowPos[0];
      } else if (st.screen === 'cartridges') {
        g.position.y = -4.75;
        floorMat.uniforms.uCenterXZ.value.x = 1.6;
      } else {
        const envl = evaluateWeaponTurntableEnvelopeInto(
          st.activeWeaponId,
          playbackClock.getState().animatedProgress
        );
        g.position.y = envl.gridFloorY;
        floorMat.uniforms.uCenterXZ.value.x = envl.cx;
      }
    });

    const isWorkbench = screen === 'workbench';
    const initialY = isWorkbench
      ? getWeaponManifest(activeWeaponId).workbenchMeta.gridY
      : screen === 'cartridges'
        ? -4.75
        : evaluateWeaponTurntableEnvelopeInto(activeWeaponId, 0).gridFloorY;

    const spec = TAKEDOWN_MAT_SPEC;
    const isLight = env.tone === 'light';

    return (
      <group ref={groupRef} position={[0, initialY, 0]}>
        {showGrid && (
          <mesh
            geometry={floorGeo}
            material={floorMat}
            scale={isTank ? 12 : 1}
            position={[0, isWorkbench ? (isTank ? -1.5 : -0.015) : 0, 0]}
            renderOrder={-10}
            frustumCulled={false}
            raycast={noopRaycast}
            userData={{ excludeFromGtao: true }}
            name="studio-cyclorama-floor"
          />
        )}

        {isWorkbench && isTank && (
          <group position={[centerX, 0, 0]} name="heavy-armor-hangar-stage">
            {/* 18 m × 12 m weathered brushed concrete hangar floor with 2.6 m alpha-feathered dissolve (Y = -120 cm) */}
            <mesh
              geometry={hangarGeos.slab}
              receiveShadow
              renderOrder={-5}
              raycast={noopRaycast}
              userData={{ excludeFromGtao: true }}
              name="heavy-armor-hangar-floor"
            >
              <meshPhysicalMaterial
                color={
                  hangarTextures ? '#ffffff' : isLight ? '#c8d1dc' : '#232830'
                }
                map={hangarTextures?.albedo ?? null}
                normalMap={hangarTextures?.normal ?? null}
                normalScale={hangarNormalScale}
                roughnessMap={hangarTextures?.roughness ?? null}
                alphaMap={hangarTextures?.alpha ?? null}
                transparent={Boolean(hangarTextures?.alpha)}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={1}
                polygonOffsetUnits={1}
                roughness={hangarTextures ? 1 : 0.9}
                metalness={0.04}
                specularIntensity={isLight ? 0.28 : 0.32}
                envMapIntensity={isLight ? 0.26 : 0.26}
              />
            </mesh>
            {/* Ø 9.6 m circular recessed steel turntable pit curb ring */}
            <mesh
              geometry={hangarGeos.pitRing}
              receiveShadow
              raycast={noopRaycast}
              name="heavy-armor-turntable-pit-ring"
            >
              <meshStandardMaterial
                color={isLight ? '#64748b' : '#475569'}
                metalness={0.78}
                roughness={0.38}
                envMapIntensity={0.72}
                polygonOffset
                polygonOffsetFactor={-1}
                polygonOffsetUnits={-1}
              />
            </mesh>
            {contactShadows && (
              <ContactShadows
                position={[0, HEAVY_ARMOR_HANGAR_SPEC.topOffsetYCm + 0.22, 0]}
                renderOrder={-2}
                depthWrite={false}
                scale={[1320, 660]}
                resolution={contactShadowResolution}
                far={260}
                blur={1.9}
                opacity={isLight ? 0.48 : 0.72}
                color="#000000"
                frames={Infinity}
              />
            )}
          </group>
        )}

        {isWorkbench && !isTank && (
          <group position={[centerX, 0, 0]}>
            <mesh
              geometry={geos.slab}
              receiveShadow
              raycast={noopRaycast}
              name="gunsmith-mat-slab"
            >
              <meshPhysicalMaterial
                color={textures ? '#ffffff' : env.mat.rubber}
                map={textures?.albedo ?? null}
                roughnessMap={textures?.roughness ?? null}
                roughness={textures ? 1 : 0.95}
                metalness={0}
                sheen={0.03}
                sheenRoughness={0.96}
                sheenColor={env.mat.sheenColor}
                envMapIntensity={0.08}
              />
            </mesh>
            <mesh
              geometry={geos.lip}
              receiveShadow
              castShadow
              raycast={noopRaycast}
              name="gunsmith-mat-lip"
            >
              <meshPhysicalMaterial
                color={textures ? '#ffffff' : env.mat.rubber}
                map={textures?.albedo ?? null}
                roughnessMap={textures?.roughness ?? null}
                roughness={textures ? 0.98 : 0.88}
                metalness={0}
                sheen={0.1}
                sheenRoughness={0.9}
                sheenColor={env.mat.sheenColor}
                envMapIntensity={0.18}
              />
            </mesh>
            {/* Recessed magnetic parts tray floor (ferritic steel plate) */}
            <mesh
              geometry={geos.trayFloor}
              receiveShadow
              raycast={noopRaycast}
              name="gunsmith-mat-tray"
            >
              <meshStandardMaterial
                color={env.mat.trayFloor}
                metalness={0.72}
                roughness={0.46}
                envMapIntensity={0.55}
              />
            </mesh>
            {contactShadows && (
              <ContactShadows
                position={[0, spec.thicknessCm + 0.015, 0]}
                scale={[spec.widthCm - 2, spec.depthCm - 2]}
                resolution={contactShadowResolution}
                far={36}
                blur={2.8}
                opacity={env.contactShadowOpacity}
                color="#000000"
                frames={Infinity}
              />
            )}
          </group>
        )}
      </group>
    );
  }
);

GunsmithStageMat.displayName = 'GunsmithStageMat';
