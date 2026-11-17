import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  Grid,
  Lightformer,
} from '@react-three/drei';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { playbackClock } from '../clock/playbackClock';
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
    fog: { color: '#0b1017', near: 170, far: 430 },
    ambient: { color: '#9fb4cc', intensity: 0.14 },
    hemisphere: {
      skyColor: '#94a9c6',
      groundColor: '#06090d',
      intensity: 0.42,
    },
    keyLight: { color: '#e4eefa', intensity: 2.55, position: [28, 42, 38] },
    rimLight: { color: '#ffb36b', intensity: 2.2, position: [-30, 18, -34] },
    fillLight: { color: '#7f96b4', intensity: 0.62, position: [-22, 8, 30] },
    topLight: { color: '#f4f8ff', intensity: 0.7, position: [-4, 34, 4] },
    underLight: { color: '#3a4a5e', intensity: 0.34, position: [10, -16, 24] },
    environmentBackground: '#05080c',
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
    toneMappingExposure: 1.2,
    postfx: { bloomStrength: 0.32, gtaoIntensity: 0.95 },
    grid: { cellColor: '#18212c', sectionColor: '#2a3748', fadeDistance: 150 },
    contactShadowOpacity: 0.62,
    mat: {
      rubber: '#151b23',
      speckleAmplitude: 9,
      ink: '#8193a8',
      inkMajor: '#c6d3e1',
      accent: '#f59e0b',
      crosshair: '#22d3ee',
      trayFloor: '#262d36',
      sheenColor: '#3b4757',
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
    fog: { color: '#14181f', near: 180, far: 440 },
    ambient: { color: '#c8b9a4', intensity: 0.16 },
    hemisphere: { skyColor: '#ffe2bf', groundColor: '#0d1015', intensity: 0.5 },
    keyLight: { color: '#ffd6aa', intensity: 2.45, position: [10, 46, 30] },
    rimLight: { color: '#8fb4e6', intensity: 1.7, position: [-30, 14, -30] },
    fillLight: { color: '#7ea6d8', intensity: 0.85, position: [-28, 10, 26] },
    topLight: { color: '#ffe0b8', intensity: 1.0, position: [0, 38, 0] },
    underLight: { color: '#3d3a36', intensity: 0.3, position: [8, -16, 22] },
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
    fog: { color: '#dce4ee', near: 250, far: 470 },
    ambient: { color: '#f8fafc', intensity: 0.4 },
    hemisphere: {
      skyColor: '#f8fafc',
      groundColor: '#64748b',
      intensity: 0.66,
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
    toneMappingExposure: 1.0,
    postfx: { bloomStrength: 0.22, gtaoIntensity: 0.78 },
    grid: { cellColor: '#cbd5e1', sectionColor: '#94a3b8', fadeDistance: 130 },
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

/** Roughness (G channel): matte rubber ≈ 0.84, printed ink ≈ 0.57, CLP oil wipes ≈ 0.45. */
export function paintGunsmithMatRoughness(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed = 0xc1f0
): void {
  const rand = createSeededRandom(seed);
  ctx.fillStyle = 'rgb(214,214,214)';
  ctx.fillRect(0, 0, w, h);
  applyGrain(ctx, w, h, rand, 16);

  const sx = w / TAKEDOWN_MAT_SPEC.widthCm;
  const sz = h / TAKEDOWN_MAT_SPEC.depthCm;
  // CLP gun-oil wipe blotches & smears
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
    const strength = 0.35 + rand() * 0.35;
    g.addColorStop(0, `rgba(112,112,112,${strength.toFixed(3)})`);
    g.addColorStop(1, 'rgba(112,112,112,0)');
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
  tex.colorSpace = colorSpace;
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
// 6. R3F components
// =====================================================================================

const noopRaycast: THREE.Object3D['raycast'] = () => {};

export interface ArmoryStudioEnvironmentProps {
  preset?: ArmoryEnvironmentPreset;
  shadowMapSize?: number;
}

/**
 * Drop-in background + fog + lights + reflection dome for a preset. The key light's shadow
 * frustum covers the whole 110 × 52 cm takedown mat so weapons and brass cast crisp shadows on it.
 */
export const ArmoryStudioEnvironment: React.FC<ArmoryStudioEnvironmentProps> =
  React.memo(
    ({ preset = DEFAULT_ARMORY_ENVIRONMENT, shadowMapSize = 2048 }) => {
      const env = getArmoryEnvironment(preset);
      return (
        <>
          <color attach="background" args={[env.background]} />
          <fog attach="fog" args={[env.fog.color, env.fog.near, env.fog.far]} />
          <ambientLight
            intensity={env.ambient.intensity}
            color={env.ambient.color}
          />
          <hemisphereLight
            args={[
              env.hemisphere.skyColor,
              env.hemisphere.groundColor,
              env.hemisphere.intensity,
            ]}
            position={[0, 30, 0]}
          />
          <directionalLight
            position={env.keyLight.position as [number, number, number]}
            intensity={env.keyLight.intensity}
            color={env.keyLight.color}
            castShadow
            shadow-mapSize={[shadowMapSize, shadowMapSize]}
            shadow-bias={-0.00025}
            shadow-normalBias={0.02}
            shadow-camera-left={-70}
            shadow-camera-right={70}
            shadow-camera-top={50}
            shadow-camera-bottom={-50}
            shadow-camera-near={1}
            shadow-camera-far={200}
          />
          <directionalLight
            position={env.rimLight.position as [number, number, number]}
            intensity={env.rimLight.intensity}
            color={env.rimLight.color}
          />
          <directionalLight
            position={env.fillLight.position as [number, number, number]}
            intensity={env.fillLight.intensity}
            color={env.fillLight.color}
          />
          <directionalLight
            position={env.topLight.position as [number, number, number]}
            intensity={env.topLight.intensity}
            color={env.topLight.color}
          />
          <directionalLight
            position={env.underLight.position as [number, number, number]}
            intensity={env.underLight.intensity}
            color={env.underLight.color}
          />
          {/* key={preset} remounts the dome so the 1-frame cubemap re-bakes on preset change */}
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
        </>
      );
    }
  );

ArmoryStudioEnvironment.displayName = 'ArmoryStudioEnvironment';

export interface GunsmithStageMatProps {
  preset?: ArmoryEnvironmentPreset;
  /** World-space X of the mat centre (the printed bore datum crosshair sits here). */
  centerX?: number;
  /** Soft real-time contact shadow pooled on the mat surface beneath the firearm */
  contactShadows?: boolean;
  /** Infinite subtle studio floor grid surrounding the mat */
  showGrid?: boolean;
}

/**
 * Workbench: 1:1 neoprene armorer's takedown mat whose top surface sits exactly at
 * `workbenchMeta.gridY` (the brass-casing floor). Showcase/Armory: only the floor grid,
 * tracking the turntable's `gridFloorY` envelope. Replaces the old pastel `StageFloorGrid`.
 */
export const GunsmithStageMat: React.FC<GunsmithStageMatProps> = React.memo(
  ({
    preset = DEFAULT_ARMORY_ENVIRONMENT,
    centerX = 0,
    contactShadows = true,
    showGrid = true,
  }) => {
    const groupRef = useRef<THREE.Group>(null);
    const screen = useAppStore((s) => s.screen);
    const activeWeaponId = useAppStore((s) => s.activeWeaponId);
    const env = getArmoryEnvironment(preset);

    const geos = useMemo(() => buildTakedownMatGeometries(), []);
    useEffect(
      () => () => {
        geos.slab.dispose();
        geos.lip.dispose();
        geos.trayFloor.dispose();
      },
      [geos]
    );

    // Module-cached textures (shared across mounts; never disposed per unmount)
    const textures = useMemo(() => getGunsmithMatTextures(preset), [preset]);

    useFrame(() => {
      const g = groupRef.current;
      if (!g) return;
      const st = useAppStore.getState();
      if (st.screen === 'workbench') {
        g.position.y = getWeaponManifest(st.activeWeaponId).workbenchMeta.gridY;
      } else if (st.screen === 'cartridges') {
        g.position.y = -4.75;
      } else {
        g.position.y = evaluateWeaponTurntableEnvelopeInto(
          st.activeWeaponId,
          playbackClock.getState().animatedProgress
        ).gridFloorY;
      }
    });

    const isWorkbench = screen === 'workbench';
    const initialY = isWorkbench
      ? getWeaponManifest(activeWeaponId).workbenchMeta.gridY
      : screen === 'cartridges'
        ? -4.75
        : evaluateWeaponTurntableEnvelopeInto(activeWeaponId, 0).gridFloorY;

    const spec = TAKEDOWN_MAT_SPEC;

    return (
      <group ref={groupRef} position={[0, initialY, 0]}>
        {showGrid && (
          <Grid
            position={[0, isWorkbench ? -0.01 : 0, 0]}
            args={[400, 400]}
            infiniteGrid
            cellSize={2}
            cellThickness={0.55}
            cellColor={env.grid.cellColor}
            sectionSize={10}
            sectionThickness={1.0}
            sectionColor={env.grid.sectionColor}
            fadeDistance={env.grid.fadeDistance}
            fadeStrength={1.4}
            raycast={noopRaycast}
            userData={{ excludeFromGtao: true }}
          />
        )}

        {isWorkbench && (
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
                roughness={textures ? 1 : 0.84}
                metalness={0}
                sheen={0.35}
                sheenRoughness={0.85}
                sheenColor={env.mat.sheenColor}
                envMapIntensity={0.42}
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
                roughness={textures ? 0.95 : 0.8}
                metalness={0}
                sheen={0.45}
                sheenRoughness={0.75}
                sheenColor={env.mat.sheenColor}
                envMapIntensity={0.5}
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
                envMapIntensity={0.8}
              />
            </mesh>
            {contactShadows && (
              <ContactShadows
                position={[0, spec.thicknessCm + 0.015, 0]}
                scale={[spec.widthCm - 2, spec.depthCm - 2]}
                resolution={512}
                far={36}
                blur={2.6}
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
