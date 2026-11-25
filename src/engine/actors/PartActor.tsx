import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { useAppStore } from '../../store/useAppStore';
import { getNarrationAudioSnapshot } from '../../narration/audioPlayer';
import { getWeaponManifest } from '../../weapons/manifests';
import type {
  MaterialKind,
  PartKinematicDelta,
  PbrBindingSpec,
  WeaponId,
  WeaponPartSpec,
} from '../../weapons/types';
import { playbackClock } from '../clock/playbackClock';
import { WEAPON_RIFLING_SPECS } from '../ballistics/riflingSpecs';
import {
  selectIsPartReplacedByAttachment,
  useAttachmentStore,
} from '../attachments/attachmentStore';
import { caliperStore } from '../caliper/caliperStore';
import { fieldStripStore } from '../fieldstrip/fieldStripStore';
import {
  getGlbPartPbrOverride,
  hasGlbWeaponAsset,
  isGlbDynamicSpringPart,
} from '../geometry/glbAssetService';
import { createMutablePose, evaluatePartPoseInto } from '../kinematics/math';
import {
  getCursorForPartHover,
  interactiveActionStore,
  isWeaponActionPart,
} from '../interaction/InteractiveActionController';
import { malfunctionStore } from '../malfunctions/malfunctionStore';
import { isTankWeapon } from '../physics/armoryPhysics';
import {
  getCachedCausalityEvaluation,
  useCausalitySandboxStore,
} from '../physics/causalitySandbox';
import {
  applyTankCrewTransformInto,
  useTankCrewStore,
} from '../tank/tankCrewStore';
import {
  type ArmoryStudioLightingPreset,
  CURATOR_SPOTLIGHT_RIM_DARK,
  CURATOR_SPOTLIGHT_RIM_DAYLIGHT,
  computeThermalSpanInto,
  createArmoryMaterialHooks,
  createArmoryShaderUniforms,
  createArmorySpringDepthMaterial,
  getArmoryProgramCacheKey,
  getArmoryWearLevel,
  resolveArmoryShaderFeatures,
  resolveSpecularAaParams,
  resolveThermalForWeapon,
  syncArmoryUniformProfile,
  usesBarrelThermalProfile,
} from '../materials/armoryShader';
import {
  ENGINEERING_ROLE_META,
  resolvePartEngineeringRole,
} from '../materials/engineeringRoles';
import {
  configurePbrTextureAnisotropy,
  getArmorDetailTextures,
  getPartPbrBundle,
  isCentennialSharedTextureFile,
  isTextureLoaded,
  subscribeTextureKeys,
} from '../materials/pbrManager';
import {
  SECTION_CUT_BOX_PLANES,
  SECTION_CUT_PLANES,
  type SectionCapSyncFn,
  type SectionCutAxis,
  StencilSectionCap,
  disposeSectionStencilPassMaterials,
  getSideMountedShellLocalZOffset,
  isThinWallCutawayShell,
  syncLocalZOffsetSectionPlane,
} from './StencilSectionCap';
import { RIFLING_EXPLODE_VISIBILITY_MAX } from './RiflingBoreActor';

export { SECTION_CUT_PLANES };

/**
 * Pure predicate determining whether vertex colors (`USE_COLOR`) remain active on
 * a part's `MeshPhysicalMaterial`:
 * - Optical X-Ray housings always disable vertex colors (`false`) for clean glass tint.
 * - Full-color Cycles baked atlases (`isMultiplicativeDetailMap === false`) disable
 *   vertex colors once `albedoReady` so baked colors are not double-tinted.
 * - Shared Centennial 1K multiplicative detail maps (`centennial_mat_*_albedo.webp`,
 *   `isMultiplicativeDetailMap === true`) KEEP `vertexColors: true` even when
 *   `albedoReady` is true so ~0.88-mean surface grain multiplies cleanly with
 *   authentic vertex colors (`CENTENNIAL_FINISH_COLORS`, brass rounds, CARC armor).
 */
export function shouldUsePartVertexColors(
  isXrayHousing: boolean,
  albedoReady: boolean,
  isMultiplicativeDetailMap: boolean
): boolean {
  return !isXrayHousing && (!albedoReady || isMultiplicativeDetailMap);
}

const MAIN_BARREL_PART_ID_RE = /^(?:.*_)?(?:barrel|barrel_cluster|main_gun)$/;

/**
 * Pure predicate deciding whether a weapon part is the main barrel/gun tube
 * that must be longitudinally clipped along `Z` (`SECTION_CUT_PLANES`) to
 * physically expose the 3D `RiflingBoreActor` helical rifling / chrome
 * smoothbore interior when Z-axis CT Cutaway is active in assembled state
 * (`explodeProgress < 0.04`). Never slices bolts, triggers, pins, springs,
 * magazines, linkages, or compound archery exhibits.
 */
export function shouldSliceBarrelForRifling(
  weaponId: WeaponId,
  part: Pick<WeaponPartSpec, 'id' | 'material' | 'isShell'>,
  sectionCut: boolean,
  sectionCutAxis: SectionCutAxis,
  explodeProgress: number,
  isSelected: boolean
): boolean {
  if (
    !sectionCut ||
    sectionCutAxis !== 'z' ||
    isSelected ||
    !Number.isFinite(explodeProgress) ||
    explodeProgress >= RIFLING_EXPLODE_VISIBILITY_MAX
  ) {
    return false;
  }
  if (WEAPON_RIFLING_SPECS[weaponId].kind === 'none') {
    return false;
  }
  return MAIN_BARREL_PART_ID_RE.test(part.id);
}

interface ArmoryMaterialConfig {
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity: number;
  edgeColor: string;
  /** CLP gun-oil thin-film interference strength */
  iridescence: number;
  sheen: number;
  sheenRoughness: number;
  sheenColor: string;
}

/** CLP gun-oil thin film: n ≈ 1.38, 120–380 nm thickness */
const GUN_OIL_IRIDESCENCE_IOR = 1.38;
const GUN_OIL_THICKNESS_RANGE: [number, number] = [120, 380];
const NO_THICKNESS_RANGE: [number, number] = [100, 400];

/**
 * Authentic gunsmith metallurgy presets (albedo comes from per-part vertex colours / atlases).
 * Note: Three.js `anisotropy` (`USE_ANISOTROPY`) is intentionally kept at 0 on procedural CSG
 * parts lacking vertex `tangent` attributes — screen-space `getTangentFrame()` yields zero T/B
 * vectors on CSG cut faces with degenerate UV derivatives, triggering `0/0 = NaN` in
 * `D_GGX_Anisotropic` (which `UnrealBloomPass` then expands into a 516×516 black NaN square).
 * Directional brushed CNC lathe grain is provided tangent-free in `armoryShader.ts`.
 */
const MATERIAL_CONFIGS: Record<MaterialKind, ArmoryMaterialConfig> = {
  // Deep QPQ / Tenifer / Parkerized gunmetal: dark, satin, oil-wetted under real studio HDRI
  nitride_steel: {
    metalness: 0.84,
    roughness: 0.34,
    clearcoat: 0.28,
    clearcoatRoughness: 0.20,
    envMapIntensity: 1.54,
    edgeColor: '#475569',
    iridescence: 0.16,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: '#000000',
  },
  // Cold-hammer-forged ordnance steel: spiral hammer-forge grain, phosphate satin
  barrel_steel: {
    metalness: 0.88,
    roughness: 0.28,
    clearcoat: 0.26,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.62,
    edgeColor: '#475569',
    iridescence: 0.16,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: '#000000',
  },
  // Bead-blasted / brushed stainless (416 / 17-4 PH)
  stainless: {
    metalness: 0.96,
    roughness: 0.20,
    clearcoat: 0.12,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1.58,
    edgeColor: '#475569',
    iridescence: 0.10,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: '#000000',
  },
  // Matte glass-filled nylon 6 / checkered walnut: deep non-metallic scatter without plastic glare
  polymer_frame: {
    metalness: 0.0,
    roughness: 0.76,
    clearcoat: 0.02,
    clearcoatRoughness: 0.72,
    envMapIntensity: 0.90,
    edgeColor: '#334155',
    iridescence: 0,
    sheen: 0.08,
    sheenRoughness: 0.88,
    sheenColor: '#475569',
  },
  // Tempered, oil-quenched music wire
  spring_steel: {
    metalness: 0.92,
    roughness: 0.24,
    clearcoat: 0.18,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.42,
    edgeColor: '#475569',
    iridescence: 0.12,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: '#000000',
  },
  // Injection-moulded acetal follower
  follower_orange: {
    metalness: 0.0,
    roughness: 0.48,
    clearcoat: 0.08,
    clearcoatRoughness: 0.42,
    envMapIntensity: 0.95,
    edgeColor: '#9a3412',
    iridescence: 0,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: '#000000',
  },
  // C26000 cartridge brass / copper jackets
  copper_accent: {
    metalness: 1.0,
    roughness: 0.22,
    clearcoat: 0.1,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.48,
    edgeColor: '#78350f',
    iridescence: 0,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: '#000000',
  },
};

const _caliperWorldNormal = new THREE.Vector3(0, 1, 0);

export interface PartDaylightMaterialTuning {
  normalScale: number;
  envMapIntensity: number;
  clearcoat: number;
  clearcoatRoughness: number;
  iridescence: number;
}

/**
 * Pure studio-adaptive PBR calibration for `blueprint_daylight` vs dark/bench studios.
 * Under high-luminance full-sphere `blueprint_daylight` IBL, dampens dark parkerized/nDLC
 * metal clearcoat, envMapIntensity & normal-map micro-relief so flat stamped/milled steel
 * receivers read as silky satin matte steel without pixel sparkle, while preserving crisp
 * machined highlights and never crossing the `0 <-> >0` threshold on `clearcoat`/`iridescence`
 * (guaranteeing zero WebGL shader recompilations on studio environment switches).
 */
export function resolvePartDaylightMaterialTuning(
  preset: ArmoryStudioLightingPreset,
  materialKind: MaterialKind,
  baseNormalScale: number,
  baseEnvMapIntensity: number,
  baseClearcoat: number,
  baseClearcoatRoughness: number,
  baseIridescence: number,
  isTank: boolean,
  isXrayHousing: boolean
): PartDaylightMaterialTuning {
  if (preset !== 'blueprint_daylight' || isXrayHousing) {
    return {
      normalScale: baseNormalScale,
      envMapIntensity: baseEnvMapIntensity,
      clearcoat: baseClearcoat,
      clearcoatRoughness: baseClearcoatRoughness,
      iridescence: baseIridescence,
    };
  }

  if (isTank) {
    return {
      normalScale: baseNormalScale * 0.86,
      envMapIntensity: baseEnvMapIntensity * 0.92,
      clearcoat: baseClearcoat > 0 ? Math.max(0.01, baseClearcoat * 0.65) : 0,
      clearcoatRoughness: Math.min(0.95, Math.max(baseClearcoatRoughness, 0.42)),
      iridescence:
        baseIridescence > 0 ? Math.max(0.01, baseIridescence * 0.5) : 0,
    };
  }

  switch (materialKind) {
    case 'nitride_steel':
      return {
        normalScale: baseNormalScale * 0.48,
        envMapIntensity: baseEnvMapIntensity * 0.62,
        clearcoat: baseClearcoat > 0 ? Math.max(0.01, baseClearcoat * 0.28) : 0,
        clearcoatRoughness: Math.min(
          0.95,
          Math.max(baseClearcoatRoughness, 0.38)
        ),
        iridescence:
          baseIridescence > 0 ? Math.max(0.01, baseIridescence * 0.25) : 0,
      };
    case 'barrel_steel':
      return {
        normalScale: baseNormalScale * 0.56,
        envMapIntensity: baseEnvMapIntensity * 0.68,
        clearcoat: baseClearcoat > 0 ? Math.max(0.01, baseClearcoat * 0.34) : 0,
        clearcoatRoughness: Math.min(
          0.95,
          Math.max(baseClearcoatRoughness, 0.34)
        ),
        iridescence:
          baseIridescence > 0 ? Math.max(0.01, baseIridescence * 0.3) : 0,
      };
    case 'spring_steel':
      return {
        normalScale: baseNormalScale * 0.66,
        envMapIntensity: baseEnvMapIntensity * 0.74,
        clearcoat: baseClearcoat > 0 ? Math.max(0.01, baseClearcoat * 0.45) : 0,
        clearcoatRoughness: Math.min(
          0.95,
          Math.max(baseClearcoatRoughness, 0.28)
        ),
        iridescence:
          baseIridescence > 0 ? Math.max(0.01, baseIridescence * 0.4) : 0,
      };
    case 'stainless':
    case 'copper_accent':
      return {
        normalScale: baseNormalScale * 0.76,
        envMapIntensity: baseEnvMapIntensity * 0.78,
        clearcoat: baseClearcoat > 0 ? Math.max(0.01, baseClearcoat * 0.65) : 0,
        clearcoatRoughness: Math.min(
          0.95,
          Math.max(baseClearcoatRoughness, 0.22)
        ),
        iridescence:
          baseIridescence > 0 ? Math.max(0.01, baseIridescence * 0.5) : 0,
      };
    case 'polymer_frame':
    case 'follower_orange':
    default:
      return {
        normalScale: baseNormalScale * 0.88,
        envMapIntensity: baseEnvMapIntensity * 0.92,
        clearcoat: baseClearcoat,
        clearcoatRoughness: baseClearcoatRoughness,
        iridescence: baseIridescence,
      };
  }
}

export interface InteractiveHandleSheenInput {
  screen: string;
  mode: string;
  isHovered: boolean;
  isDraggingThisHandle: boolean;
  isActionPart: boolean;
  isGhostByIsolate: boolean;
  fieldStripActive: boolean;
  caliperActive: boolean;
  malfunctionActive: boolean;
  isFiringPlaying: boolean;
  explodeProgress: number;
}

/**
 * Pure gating predicate for the subtle warm metallic sheen affordance cue on
 * interactive 3D grab handles (slide / charging handle / bolt / lever / forend / breech).
 * Active ONLY when hovered or dragged in paused firing mode or assembled press-check state
 * (`explodeProgress < 0.05`) and never during field-strip, caliper, or malfunction modes.
 */
export function shouldShowInteractiveHandleSheen(
  input: Readonly<InteractiveHandleSheenInput>
): boolean {
  if (!input.isActionPart) return false;
  if (input.screen !== 'workbench') return false;
  if (
    input.isGhostByIsolate ||
    input.fieldStripActive ||
    input.caliperActive ||
    input.malfunctionActive ||
    input.isFiringPlaying
  ) {
    return false;
  }
  if (!input.isHovered && !input.isDraggingThisHandle) return false;
  if (input.mode === 'firing') return true;
  return input.mode === 'explode' && input.explodeProgress < 0.05;
}

const INTERACTIVE_HANDLE_SHEEN_HEX = 0xd99a4e;

/** Target weights for the Smithsonian museum pin-spot Fresnel rim & documentary depth emphasis. */
export interface CuratorSpotlightTargets {
  /** Grazing-angle Fresnel pin-spot rim catchlight weight in `[0, 1]`. */
  rimWeight: number;
  /** Non-focused background diffuse/IBL depth emphasis multiplier in `[0.72, 1.0]`. */
  dimFactor: number;
}

export const CURATOR_RIM_DIRECTOR_FOCUSED = 1.0;
export const CURATOR_RIM_SELECTED = 0.88;
export const CURATOR_RIM_HOVERED = 0.35;
export const CURATOR_DIRECTOR_BG_DIM = 0.72;
export const CURATOR_SPOTLIGHT_LERP_SPEED = 10.0;

/**
 * Zero-GC in-place evaluator for museum pin-spot Fresnel rim emphasis and
 * Documentary Director Mode background dimming.
 */
export function writeCuratorSpotlightTargetsInto(
  isSelected: boolean,
  isHovered: boolean,
  isDirectorFocused: boolean,
  hasAnyFocus: boolean,
  isDirectorActive: boolean,
  isFieldStrip: boolean,
  isIsolated: boolean,
  out: CuratorSpotlightTargets
): CuratorSpotlightTargets {
  if (isDirectorFocused) {
    out.rimWeight = CURATOR_RIM_DIRECTOR_FOCUSED;
    out.dimFactor = 1.0;
    return out;
  }
  if (isSelected) {
    out.rimWeight = CURATOR_RIM_SELECTED;
    out.dimFactor = 1.0;
    return out;
  }
  if (isHovered) {
    out.rimWeight = CURATOR_RIM_HOVERED;
    out.dimFactor = 1.0;
    return out;
  }
  const shouldDimBackground =
    isDirectorActive && hasAnyFocus && !isFieldStrip && !isIsolated;
  out.rimWeight = 0;
  out.dimFactor = shouldDimBackground ? CURATOR_DIRECTOR_BG_DIM : 1.0;
  return out;
}

/**
 * Pure state evaluator for museum pin-spot Fresnel rim catchlight and
 * Documentary Director Mode background depth emphasis:
 * - Default unselected idle (`hasAnyFocus === false`): `{ rimWeight: 0, dimFactor: 1 }`
 * - Selected or Director-focused part: `{ rimWeight: 0.88..1.0, dimFactor: 1.0 }`
 * - Unfocused sibling during active Director Mode (outside field-strip & isolate): `{ rimWeight: 0, dimFactor: 0.72 }`
 * - Hovered part (unselected): `{ rimWeight: 0.35, dimFactor: 1.0 }`
 */
export function computeCuratorSpotlightTargets(
  isSelected: boolean,
  isHovered: boolean,
  isDirectorFocused: boolean,
  hasAnyFocus: boolean,
  isDirectorActive: boolean,
  isFieldStrip: boolean,
  isIsolated: boolean
): CuratorSpotlightTargets {
  return writeCuratorSpotlightTargetsInto(
    isSelected,
    isHovered,
    isDirectorFocused,
    hasAnyFocus,
    isDirectorActive,
    isFieldStrip,
    isIsolated,
    { rimWeight: 0, dimFactor: 1 }
  );
}

// Module-pooled Zero-GC scratch objects for useFrame curator spotlight interpolation
const _curatorTarget: CuratorSpotlightTargets = { rimWeight: 0, dimFactor: 1 };
const _curatorRimDarkColor = new THREE.Color(CURATOR_SPOTLIGHT_RIM_DARK);
const _curatorRimDaylightColor = new THREE.Color(CURATOR_SPOTLIGHT_RIM_DAYLIGHT);

// Module-pooled scratch struct for Zero-GC useFrame sheen checks
const _sheenQuery: InteractiveHandleSheenInput = {
  screen: 'armory',
  mode: 'explode',
  isHovered: false,
  isDraggingThisHandle: false,
  isActionPart: false,
  isGhostByIsolate: false,
  fieldStripActive: false,
  caliperActive: false,
  malfunctionActive: false,
  isFiringPlaying: false,
  explodeProgress: 0,
};

export function sectionAwareMeshRaycast(
  this: THREE.Mesh,
  raycaster: THREE.Raycaster,
  intersects: THREE.Intersection[]
): void {
  const startIdx = intersects.length;
  THREE.Mesh.prototype.raycast.call(this, raycaster, intersects);
  const mat = this.material;
  if (!mat || Array.isArray(mat) || !mat.clippingPlanes?.length) return;
  const planes = mat.clippingPlanes;
  for (let i = intersects.length - 1; i >= startIdx; i--) {
    const pt = intersects[i].point;
    for (let p = 0; p < planes.length; p++) {
      if (planes[p].distanceToPoint(pt) < 0) {
        intersects.splice(i, 1);
        break;
      }
    }
  }
}

export interface PartActorProps {
  weaponId: WeaponId;
  part: WeaponPartSpec;
  geometry: THREE.BufferGeometry | null;
  customPbrBinding?: PbrBindingSpec;
  computeKinematics: (partId: string, f: number) => PartKinematicDelta;
}

export const PartActor: React.FC<PartActorProps> = React.memo(
  ({ weaponId, part, geometry, customPbrBinding, computeKinematics }) => {
    const groupRef = useRef<THREE.Group>(null);
    const matRef = useRef<THREE.MeshPhysicalMaterial>(null);
    const poseRef = useRef(createMutablePose());
    const hadTransientHighlightRef = useRef(false);
    const baseEmissiveRef = useRef<string>('#000000');
    const baseEmissiveIntensityRef = useRef<number>(0);

    // Boolean-granular Zustand selectors so pointer hover only re-renders the 1-2 affected parts
    const pbrTexturesEnabled = useAppStore((s) => s.pbrTexturesEnabled);
    const isSelected = useAppStore(
      (s) => s.screen === 'workbench' && s.selectedPartId === part.id
    );
    const isHovered = useAppStore(
      (s) => s.screen === 'workbench' && s.hoveredPartId === part.id
    );
    const isGhostByIsolate = useAppStore(
      (s) =>
        s.screen === 'workbench' &&
        s.isolateSelected &&
        s.selectedPartId !== null &&
        s.selectedPartId !== part.id
    );
    const xrayShells = useAppStore((s) => s.xrayShells);
    const sectionCut = useAppStore((s) => s.sectionCut);
    const sectionCutAxis = useAppStore((s) => s.sectionCutAxis);
    const showEdges = useAppStore((s) => s.showEdges);
    const environmentPreset = useAppStore((s) => s.environmentPreset);
    const isDaylightTheme = environmentPreset === 'blueprint_daylight';
    const engineeringTint = useAppStore((s) => s.engineeringTint);
    const focusedEngineeringRole = useAppStore((s) => s.focusedEngineeringRole);
    const isGroupHidden = useAppStore((s) => s.hiddenGroups[part.group]);
    const isReplacedByAttachment = useAttachmentStore((s) =>
      selectIsPartReplacedByAttachment(s, weaponId, part.id)
    );
    const selectPart = useAppStore((s) => s.selectPart);
    const hoverPart = useAppStore((s) => s.hoverPart);

    const isMainBarrelPart =
      MAIN_BARREL_PART_ID_RE.test(part.id) &&
      WEAPON_RIFLING_SPECS[weaponId].kind !== 'none';
    const [isAssemblyClosedForRifling, setIsAssemblyClosedForRifling] =
      useState(
        () =>
          playbackClock.getState().animatedProgress <
          RIFLING_EXPLODE_VISIBILITY_MAX
      );
    const barrelClosedRef = useRef(isAssemblyClosedForRifling);

    const isTank =
      getWeaponManifest(weaponId).workbenchMeta.scaleProfile ===
      'main_battle_tank';
    const surfaceScale = isTank ? 10 : 1;

    const partRole = useMemo(
      () => resolvePartEngineeringRole(weaponId, part),
      [weaponId, part]
    );
    const isActionPart = useMemo(
      () => isWeaponActionPart(weaponId, part.id),
      [weaponId, part.id]
    );
    const storyKeyPrefix = useMemo(() => `story:${weaponId}:`, [weaponId]);

    const isGlbAsset = geometry?.userData?.isGlbAsset === true;
    // Prefetch v3 Cycles-baked atlases in parallel while the Draco GLB streams,
    // automatically falling back to `customPbrBinding` if a part lands on CSG fallback.
    const preferGlbPbr =
      isGlbAsset ||
      (geometry === null &&
        typeof window !== 'undefined' &&
        hasGlbWeaponAsset(weaponId) &&
        !isGlbDynamicSpringPart(weaponId, part.id));
    const effectivePbrBinding = useMemo(
      () =>
        preferGlbPbr
          ? (getGlbPartPbrOverride(weaponId, part.id) ?? customPbrBinding)
          : customPbrBinding,
      [preferGlbPbr, weaponId, part.id, customPbrBinding]
    );

    const matCfg = MATERIAL_CONFIGS[part.material];
    const pbr = useMemo(
      () => getPartPbrBundle(weaponId, part.material, effectivePbrBinding),
      [weaponId, part.material, effectivePbrBinding]
    );
    const armorDetail = useMemo(() => getArmorDetailTextures(), []);
    const allTextureKeys = useMemo(
      () =>
        armorDetail.textureKeys.length > 0
          ? [...pbr.textureKeys, ...armorDetail.textureKeys]
          : pbr.textureKeys,
      [pbr.textureKeys, armorDetail.textureKeys]
    );

    const [texTick, setTexTick] = useState(0);
    useEffect(() => {
      return subscribeTextureKeys(allTextureKeys, () => {
        setTexTick((n) => n + 1);
      });
    }, [allTextureKeys]);

    const isXrayHousing = xrayShells && !!part.isShell && !isSelected;
    const isTankBareMetal =
      isTank &&
      (part.material === 'stainless' ||
        part.material === 'copper_accent' ||
        part.material === 'spring_steel');
    const isTankOrdnanceBarrel = isTank && part.material === 'barrel_steel';
    const baseClearcoat = isXrayHousing
      ? 0.36
      : isTank
        ? isTankBareMetal
          ? 0.06
          : isTankOrdnanceBarrel
            ? 0.04
            : 0.0
        : matCfg.clearcoat;
    const baseClearcoatRoughness = isXrayHousing
      ? 0.14
      : isTank
        ? 0.38
        : matCfg.clearcoatRoughness;
    const baseIridescence = isXrayHousing || isTank ? 0 : matCfg.iridescence;
    const baseEnvMapIntensity = isXrayHousing
      ? 0.54
      : isTank
        ? isTankBareMetal
          ? 1.32
          : isTankOrdnanceBarrel
            ? 1.08
            : part.material === 'polymer_frame'
              ? 0.78
              : 0.86
        : matCfg.envMapIntensity;
    const daylightTuning = resolvePartDaylightMaterialTuning(
      environmentPreset,
      part.material,
      pbr.normalScale,
      baseEnvMapIntensity,
      baseClearcoat,
      baseClearcoatRoughness,
      baseIridescence,
      isTank,
      isXrayHousing
    );

    const [normalScaleVec] = useState(
      () =>
        new THREE.Vector2(
          daylightTuning.normalScale,
          daylightTuning.normalScale
        )
    );

    // Clamp PBR texture anisotropy to the GPU's real capability (idempotent)
    const gl = useThree((s) => s.gl);
    useEffect(() => {
      configurePbrTextureAnisotropy(gl.capabilities.getMaxAnisotropy());
    }, [gl]);

    // --- AAA Armory surface shader: per-part uniform refs (mutated in useFrame, zero GC) ---
    const [armoryUniforms] = useState(() =>
      createArmoryShaderUniforms(part.material, surfaceScale)
    );
    const armoryFeatures = useMemo(
      () =>
        resolveArmoryShaderFeatures(
          { id: part.id, material: part.material },
          geometry,
          pbr.hasCustomAtlas
        ),
      [part.id, part.material, geometry, pbr.hasCustomAtlas]
    );
    const armoryHooks = useMemo(
      () => createArmoryMaterialHooks(armoryFeatures, armoryUniforms),
      [armoryFeatures, armoryUniforms]
    );
    const armoryUserData = useMemo(
      () => ({ armoryUniforms, armoryFeatures }),
      [armoryUniforms, armoryFeatures]
    );
    const springDepthMaterial = useMemo(
      () =>
        armoryFeatures.spring
          ? createArmorySpringDepthMaterial(armoryUniforms)
          : null,
      [armoryFeatures.spring, armoryUniforms]
    );
    useEffect(() => {
      return () => springDepthMaterial?.dispose();
    }, [springDepthMaterial]);

    useEffect(() => {
      syncArmoryUniformProfile(armoryUniforms, part.material, surfaceScale);
      armoryUniforms.uSpringScale.value = 1;
    }, [armoryUniforms, part.material, surfaceScale]);

    // Cycle 22C: Sync studio Specular AA uniforms in-place (zero WebGL shader recompilation)
    useEffect(() => {
      const specAa = resolveSpecularAaParams(environmentPreset, isTank);
      armoryUniforms.uSpecularAaStrength.value = specAa.strength;
      armoryUniforms.uSpecularAaThreshold.value = specAa.threshold;
      armoryUniforms.uMicroDetailDamping.value = specAa.microDetailDamping;
    }, [armoryUniforms, environmentPreset, isTank]);

    useEffect(() => {
      if (!geometry) return;
      computeThermalSpanInto(geometry, armoryUniforms.uThermalSpan.value);
      armoryUniforms.uThermalProfileMix.value = usesBarrelThermalProfile(part)
        ? 1
        : 0;
    }, [geometry, armoryUniforms, part]);

    // WP-05: Update functional role tint uniforms in-place (zero WebGL shader recompilation)
    useEffect(() => {
      if (!engineeringTint) {
        armoryUniforms.uFunctionalTintMix.value = 0;
        return;
      }
      const roleMeta = ENGINEERING_ROLE_META[partRole];
      if (focusedEngineeringRole === null) {
        armoryUniforms.uFunctionalTint.value.set(roleMeta.colorHex);
        armoryUniforms.uFunctionalTintMix.value = roleMeta.mixStrength;
      } else if (focusedEngineeringRole === partRole) {
        armoryUniforms.uFunctionalTint.value.set(roleMeta.colorHex);
        armoryUniforms.uFunctionalTintMix.value = Math.min(
          0.94,
          roleMeta.mixStrength + 0.08
        );
      } else {
        armoryUniforms.uFunctionalTint.value.set('#1e293b');
        armoryUniforms.uFunctionalTintMix.value = 0.86;
      }
    }, [armoryUniforms, engineeringTint, focusedEngineeringRole, partRole]);

    const usePbrNow = pbrTexturesEnabled && !isXrayHousing;
    const isBarrelRiflingCut = shouldSliceBarrelForRifling(
      weaponId,
      part,
      sectionCut,
      sectionCutAxis,
      isAssemblyClosedForRifling ? 0 : RIFLING_EXPLODE_VISIBILITY_MAX,
      isSelected
    );
    const isSectionCutShell =
      (sectionCut && !!part.isShell && !isSelected) || isBarrelRiflingCut;
    const albedoReady =
      usePbrNow && pbr.hasCustomAtlas && isTextureLoaded(pbr.map);
    const normalReady = usePbrNow && isTextureLoaded(pbr.normalMap);
    const roughReady = usePbrNow && isTextureLoaded(pbr.roughnessMap);

    const activeMap = albedoReady ? pbr.map : null;
    const activeNormalMap = normalReady ? pbr.normalMap : null;
    const activeOrmMap = roughReady ? pbr.roughnessMap : null;
    const activeMetalnessMap =
      pbr.hasCustomAtlas && activeOrmMap ? activeOrmMap : null;
    const isMultiplicativeDetailMap = Boolean(
      effectivePbrBinding &&
        isCentennialSharedTextureFile(effectivePbrBinding.albedoFile)
    );
    const useVertexColors = shouldUsePartVertexColors(
      isXrayHousing,
      albedoReady,
      isMultiplicativeDetailMap
    );
    // Armory shader stays off on optical X-ray housings (clean glass look), except springs.
    const armoryActive = !isXrayHousing || armoryFeatures.spring;
    const matShaderKey = `${isXrayHousing ? 'x' : 's'}-${isTank ? 't1' : 't0'}-${isSectionCutShell ? (sectionCutAxis === 'box' ? 'cb' : 'c1') : 'c0'}-${isGlbAsset ? 'g1' : 'g0'}-${useVertexColors ? 'vc1' : 'vc0'}-${activeMap ? 'm1' : 'm0'}-${activeNormalMap ? 'n1' : 'n0'}-${activeOrmMap ? 'o1' : 'o0'}-${activeMetalnessMap ? 'mt1' : 'mt0'}-${armoryActive ? getArmoryProgramCacheKey(armoryFeatures) : 'plain'}`;
    const hasMeshVisible = Boolean(
      geometry && !isGroupHidden && !isReplacedByAttachment
    );

    // Sync BOTH the stable Vector2 prop AND Three.js's live material.normalScale directly:
    // R3F copies Vector2 props by value (`targetProp.copy(value)`) and skips `diffProps`
    // when the Vector2 reference is identical across live `[Vault] <-> [Blueprint]` toggles.
    useEffect(() => {
      normalScaleVec.set(
        daylightTuning.normalScale,
        daylightTuning.normalScale
      );
      matRef.current?.normalScale.set(
        daylightTuning.normalScale,
        daylightTuning.normalScale
      );
    }, [
      normalScaleVec,
      daylightTuning.normalScale,
      matShaderKey,
      hasMeshVisible,
    ]);

    const armorDetailReady =
      usePbrNow &&
      isTextureLoaded(armorDetail.normalMap) &&
      isTextureLoaded(armorDetail.roughnessMap);

    // Sync seamless 512x512 RHA/CARC triplanar detail normal & roughness uniforms in-place (zero shader recompile)
    useEffect(() => {
      armoryUniforms.uArmorDetailNormal.value = armorDetailReady
        ? armorDetail.normalMap
        : null;
      armoryUniforms.uArmorDetailRoughness.value = armorDetailReady
        ? armorDetail.roughnessMap
        : null;
      armoryUniforms.uHasArmorDetail.value = armorDetailReady ? 1 : 0;
    }, [
      armoryUniforms,
      armorDetailReady,
      armorDetail.normalMap,
      armorDetail.roughnessMap,
      texTick,
    ]);

    const capSyncRef = useRef<SectionCapSyncFn | null>(null);
    // Canted shell parts (e.g. AN-94 15°-canted plum magazine) and left-flank side-hung drums
    // (e.g. MG 42 Gurttrommel 34 at Z = -6.4 cm) slice along their own local Z plane in Z-axis mode.
    const isCantedShell =
      sectionCutAxis === 'z' &&
      !!part.isShell &&
      Math.abs(part.assembledRot?.[0] ?? 0) > 1e-4;
    const sideMountedLocalZOffset =
      sectionCutAxis === 'z' && !!part.isShell
        ? getSideMountedShellLocalZOffset(part.id)
        : null;
    const usesPerPartLocalZPlane =
      isCantedShell || sideMountedLocalZOffset !== null;
    const activeClipPlanes = useMemo(() => {
      if (sectionCutAxis === 'box') return SECTION_CUT_BOX_PLANES;
      return usesPerPartLocalZPlane
        ? [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)]
        : SECTION_CUT_PLANES;
    }, [usesPerPartLocalZPlane, sectionCutAxis]);
    useEffect(() => {
      if (!usesPerPartLocalZPlane) return;
      return () => disposeSectionStencilPassMaterials(activeClipPlanes);
    }, [usesPerPartLocalZPlane, activeClipPlanes]);

    // Ensure K98k charger stripper clip starts stowed cleanly when bolt is closed at t = 0
    useEffect(() => {
      const grp = groupRef.current;
      if (!grp || part.id !== 'k98k_stripper_clip') return;
      const appState = useAppStore.getState();
      const clock = playbackClock.getState();
      const fieldStripOn =
        appState.screen === 'workbench' &&
        appState.fieldStripActive &&
        appState.mode === 'explode';
      const selectedNow =
        appState.screen === 'workbench' && appState.selectedPartId === part.id;
      grp.visible =
        fieldStripOn ||
        selectedNow ||
        (appState.mode === 'firing'
          ? clock.animatedFireProgress >= 0.55 &&
            clock.animatedFireProgress <= 0.79
          : clock.animatedProgress > 0.04);
    }, [part.id, isSelected]);

    useFrame((_state, delta) => {
      const grp = groupRef.current;
      if (!grp) return;
      const clock = playbackClock.getState();
      const appState = useAppStore.getState();
      const isFiring = appState.mode === 'firing';
      const isFieldStrip =
        appState.screen === 'workbench' &&
        appState.fieldStripActive &&
        appState.mode === 'explode';
      const isMalfunction =
        appState.screen === 'workbench' && appState.malfunctionActive;

      if (isFieldStrip) {
        fieldStripStore.evaluatePartPoseInto(weaponId, part, poseRef.current);
      } else {
        evaluatePartPoseInto(
          part,
          clock.animatedProgress,
          isFiring,
          clock.animatedFireProgress,
          computeKinematics,
          poseRef.current
        );
        if (isMalfunction) {
          malfunctionStore.applyPartPoseDelta(weaponId, part.id, poseRef.current);
        } else {
          if (isFiring && appState.screen === 'workbench') {
            const causality = useCausalitySandboxStore.getState();
            if (
              causality.enabled &&
              !part.isShell &&
              (part.group === 'slide' ||
                /bolt|carrier|slide|piston|handle|buffer/i.test(part.id))
            ) {
              const dx = poseRef.current.px - part.assembledPos[0];
              if (dx < -0.05) {
                const strokeRatio = getCachedCausalityEvaluation(
                  weaponId,
                  causality
                ).strokeRatio;
                poseRef.current.px = part.assembledPos[0] + dx * strokeRatio;
              }
            }
          }
          if (appState.screen === 'workbench') {
            const tankCrew = useTankCrewStore.getState();
            if (tankCrew.active && isTankWeapon(weaponId)) {
              applyTankCrewTransformInto(
                weaponId,
                part.id,
                tankCrew.turretYawDeg,
                tankCrew.gunElevDeg,
                poseRef.current
              );
            }
          }
        }
      }

      const p = poseRef.current;
      grp.position.set(p.px, p.py, p.pz);
      grp.rotation.set(p.rx, p.ry, p.rz);

      // K98k 5-round brass stripper clip stows cleanly while the Mauser 98 bolt is closed & locked,
      // revealing automatically during exploded disassembly (t > 0.04), field-strip, selection, or open-bolt reload.
      if (part.id === 'k98k_stripper_clip') {
        const isPartSelected =
          appState.screen === 'workbench' && appState.selectedPartId === part.id;
        grp.visible =
          isFieldStrip ||
          isPartSelected ||
          (isFiring
            ? clock.animatedFireProgress >= 0.55 &&
              clock.animatedFireProgress <= 0.79
            : clock.animatedProgress > 0.04);
      }

      // Sync main barrel rifling-cutaway gating on the single threshold edge (`explodeProgress < 0.04`)
      if (isMainBarrelPart) {
        const closedNow =
          clock.animatedProgress < RIFLING_EXPLODE_VISIBILITY_MAX;
        if (closedNow !== barrelClosedRef.current) {
          barrelClosedRef.current = closedNow;
          setIsAssemblyClosedForRifling(closedNow);
        }
      }

      const u = armoryUniforms;
      if (armoryFeatures.spring) {
        // GPU constant-wire-diameter compression: never squash the wire via object scale
        grp.scale.set(1, 1, 1);
        u.uSpringScale.value = p.sx;
      } else {
        grp.scale.set(p.sx, 1, 1);
      }

      u.uWearLevel.value = getArmoryWearLevel();

      if (armoryFeatures.thermal || armoryFeatures.fouling) {
        const th = resolveThermalForWeapon(weaponId);
        u.uThermalHeat.value = armoryFeatures.thermal ? th.heat : 0;
        u.uCarbonFouling.value = armoryFeatures.thermal
          ? th.fouling
          : th.fouling * 0.7;
      } else {
        u.uThermalHeat.value = 0;
        u.uCarbonFouling.value = 0;
      }

      // Cycle 13C: Smithsonian museum pin-spot Fresnel rim catchlight & Documentary Director depth emphasis
      const inWorkbench = appState.screen === 'workbench';
      const narrationSnap = getNarrationAudioSnapshot();
      const isDirectorActive =
        inWorkbench &&
        appState.storyOpen &&
        appState.storyDirectorMode &&
        narrationSnap.activeKind === 'story' &&
        narrationSnap.isPlaying &&
        narrationSnap.activeKey !== null &&
        narrationSnap.activeKey.startsWith(storyKeyPrefix);
      const hasAnyFocus = inWorkbench && appState.selectedPartId !== null;
      const isSelectedNow = inWorkbench && appState.selectedPartId === part.id;
      const isGhostByIsolateNow =
        hasAnyFocus && appState.isolateSelected && !isSelectedNow;
      const isHoveredNow =
        inWorkbench &&
        appState.hoveredPartId === part.id &&
        !isGhostByIsolateNow;
      const isDirectorFocused = isDirectorActive && isSelectedNow;

      writeCuratorSpotlightTargetsInto(
        isSelectedNow,
        isHoveredNow,
        isDirectorFocused,
        hasAnyFocus,
        isDirectorActive,
        isFieldStrip,
        appState.isolateSelected,
        _curatorTarget
      );

      const safeDelta = Number.isFinite(delta) ? delta : 0.016;
      const dt = Math.min(Math.max(safeDelta, 0), 0.05);
      const lerpAlpha =
        dt > 0 ? 1 - Math.exp(-CURATOR_SPOTLIGHT_LERP_SPEED * dt) : 1;

      const spotDiff = _curatorTarget.rimWeight - u.uCuratorSpot.value;
      if (Math.abs(spotDiff) < 0.0015) {
        u.uCuratorSpot.value = _curatorTarget.rimWeight;
      } else {
        u.uCuratorSpot.value += spotDiff * lerpAlpha;
      }

      const dimDiff = _curatorTarget.dimFactor - u.uCuratorDim.value;
      if (Math.abs(dimDiff) < 0.0015) {
        u.uCuratorDim.value = _curatorTarget.dimFactor;
      } else {
        u.uCuratorDim.value += dimDiff * lerpAlpha;
      }

      u.uCuratorRimColor.value.copy(
        appState.environmentPreset === 'blueprint_daylight'
          ? _curatorRimDaylightColor
          : _curatorRimDarkColor
      );

      const specAaNow = resolveSpecularAaParams(
        appState.environmentPreset,
        isTank
      );
      u.uSpecularAaStrength.value = specAaNow.strength;
      u.uSpecularAaThreshold.value = specAaNow.threshold;
      u.uMicroDetailDamping.value = specAaNow.microDetailDamping;

      // WP-07 & WP-09: Zero-GC transient interference / diagnostic pulsing
      const mat = matRef.current;
      if (mat) {
        const nowMs = performance.now();
        const hl = isFieldStrip
          ? fieldStripStore.getPartHighlight(weaponId, part.id, nowMs)
          : 'none';
        const mRole =
          hl === 'none' && isMalfunction
            ? malfunctionStore.getPartDiagnosticRole(weaponId, part.id)
            : 'none';
        if (hl !== 'none') {
          const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.011);
          if (hl === 'blocking') {
            mat.emissive.setHex(0xef4444);
            mat.emissiveIntensity = 0.32 + 0.46 * pulse;
          } else if (hl === 'blocked') {
            mat.emissive.setHex(0xf59e0b);
            mat.emissiveIntensity = 0.22 + 0.34 * pulse;
          } else {
            mat.emissive.setHex(0x10b981);
            mat.emissiveIntensity = 0.26 + 0.42 * pulse;
          }
          hadTransientHighlightRef.current = true;
        } else if (mRole !== 'none') {
          const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.0085);
          if (mRole === 'causal') {
            mat.emissive.setHex(0xf59e0b);
            mat.emissiveIntensity = 0.22 + 0.36 * pulse;
          } else if (mRole === 'action') {
            mat.emissive.setHex(0x0ea5e9);
            mat.emissiveIntensity = 0.16 + 0.28 * pulse;
          } else {
            mat.emissive.setHex(0x10b981);
            mat.emissiveIntensity = 0.22;
          }
          hadTransientHighlightRef.current = true;
        } else {
          const hoveredNow = appState.hoveredPartId === part.id;
          const draggingActionNow =
            interactiveActionStore.getSnapshot().isDraggingAction;
          _sheenQuery.screen = appState.screen;
          _sheenQuery.mode = appState.mode;
          _sheenQuery.isHovered = hoveredNow;
          _sheenQuery.isDraggingThisHandle = draggingActionNow && hoveredNow;
          _sheenQuery.isActionPart = isActionPart;
          _sheenQuery.isGhostByIsolate =
            appState.screen === 'workbench' &&
            appState.isolateSelected &&
            appState.selectedPartId !== null &&
            appState.selectedPartId !== part.id;
          _sheenQuery.fieldStripActive = appState.fieldStripActive;
          _sheenQuery.caliperActive = appState.caliperActive;
          _sheenQuery.malfunctionActive = appState.malfunctionActive;
          _sheenQuery.isFiringPlaying = appState.isFiringPlaying;
          _sheenQuery.explodeProgress = clock.animatedProgress;

          if (shouldShowInteractiveHandleSheen(_sheenQuery)) {
            mat.emissive.setHex(INTERACTIVE_HANDLE_SHEEN_HEX);
            if (_sheenQuery.isDraggingThisHandle) {
              mat.emissiveIntensity = 0.22;
            } else {
              const breathe = 0.5 + 0.5 * Math.sin(nowMs * 0.0055);
              mat.emissiveIntensity = 0.11 + 0.065 * breathe;
            }
            hadTransientHighlightRef.current = true;
          } else if (hadTransientHighlightRef.current) {
            mat.emissive.set(baseEmissiveRef.current);
            mat.emissiveIntensity = baseEmissiveIntensityRef.current;
            hadTransientHighlightRef.current = false;
          }
        }
      }

      const syncCap = capSyncRef.current;
      if (usesPerPartLocalZPlane || syncCap) {
        grp.updateWorldMatrix(true, false);
        if (usesPerPartLocalZPlane) {
          syncLocalZOffsetSectionPlane(
            grp.matrixWorld,
            SECTION_CUT_PLANES[0],
            sideMountedLocalZOffset ?? 0,
            activeClipPlanes[0]
          );
        }
        if (syncCap) {
          syncCap(grp);
        }
      }
    });

    if (!geometry || isGroupHidden || isReplacedByAttachment) return null;

    const isTransparent = isGhostByIsolate || isXrayHousing;

    // Optical X-ray clarity: ultra-low front-face haze + clean depth sorting (renderOrder 12)
    // keeps internal springs, locking rollers, gas pistons, and FCG sears razor-sharp!
    let opacity = 1.0;
    if (isGhostByIsolate) opacity = 0.075;
    else if (isXrayHousing) opacity = isHovered ? 0.135 : 0.095;

    let emissive = '#000000';
    let emissiveIntensity = 0;
    if (isSelected) {
      emissive = isDaylightTheme ? '#0284c7' : '#ffe8c2';
      emissiveIntensity = isDaylightTheme ? 0.14 : 0.06;
    } else if (isHovered && !isGhostByIsolate) {
      emissive = isDaylightTheme ? '#0ea5e9' : '#ffe8c2';
      emissiveIntensity = isXrayHousing ? 0.06 : isDaylightTheme ? 0.1 : 0.04;
    } else if (
      engineeringTint &&
      focusedEngineeringRole === partRole &&
      !isGhostByIsolate
    ) {
      emissive = ENGINEERING_ROLE_META[partRole].colorHex;
      emissiveIntensity = isXrayHousing ? 0.08 : 0.18;
    }
    baseEmissiveRef.current = emissive;
    baseEmissiveIntensityRef.current = emissiveIntensity;

    const edgeColor = isSelected
      ? isDaylightTheme
        ? '#0284c7'
        : '#f5d89e'
      : isHovered
        ? isDaylightTheme
          ? '#0ea5e9'
          : '#e2c896'
        : matCfg.edgeColor;

    const meshRenderOrder = isXrayHousing ? 12 : isGhostByIsolate ? 11 : 1;

    const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const st = useAppStore.getState();
      if (st.screen !== 'workbench') {
        document.body.style.cursor = 'pointer';
        return;
      }
      hoverPart(part.id);
      const explodeProgress = playbackClock.getState().animatedProgress;
      const isDragging = interactiveActionStore.getSnapshot().isDraggingAction;
      document.body.style.cursor = getCursorForPartHover(
        st,
        part.id,
        explodeProgress,
        isDragging
      );
    };

    const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
      const st = useAppStore.getState();
      if (st.screen !== 'workbench' || !st.caliperActive) return;
      e.stopPropagation();
      if (e.face) {
        _caliperWorldNormal
          .copy(e.face.normal)
          .transformDirection(e.object.matrixWorld);
      } else {
        _caliperWorldNormal.set(0, 1, 0);
      }
      caliperStore.setTransientHover(
        part.id,
        e.point.x,
        e.point.y,
        e.point.z,
        _caliperWorldNormal.x,
        _caliperWorldNormal.y,
        _caliperWorldNormal.z
      );
    };

    const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const st = useAppStore.getState();
      if (st.hoveredPartId === part.id) {
        hoverPart(null);
      }
      if (st.caliperActive) {
        caliperStore.clearTransientHover(part.id);
      }
      if (!interactiveActionStore.getSnapshot().isDraggingAction) {
        document.body.style.cursor = 'auto';
      }
    };

    const handleClick = (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const st = useAppStore.getState();
      if (st.screen !== 'workbench') {
        if (st.screen !== 'split_showdown' && e.delta <= 5) {
          st.enterWorkbench(st.activeWeaponId);
        }
        return;
      }
      if (st.caliperActive && !e.nativeEvent.shiftKey) {
        if (e.delta <= 6) {
          if (e.face) {
            _caliperWorldNormal
              .copy(e.face.normal)
              .transformDirection(e.object.matrixWorld);
          } else {
            _caliperWorldNormal.set(0, 1, 0);
          }
          caliperStore.recordSurfacePoint(
            weaponId,
            part.id,
            [e.point.x, e.point.y, e.point.z],
            [
              _caliperWorldNormal.x,
              _caliperWorldNormal.y,
              _caliperWorldNormal.z,
            ]
          );
        }
        return;
      }
      if (
        st.fieldStripActive &&
        st.mode === 'explode' &&
        !e.nativeEvent.shiftKey
      ) {
        if (e.delta <= 6) {
          fieldStripStore.attemptPartClick(weaponId, part.id);
        }
        return;
      }
      if (st.malfunctionActive && !e.nativeEvent.shiftKey) {
        if (e.delta <= 6) {
          const handled = malfunctionStore.handlePartClick(weaponId, part.id);
          if (handled) return;
        }
      }
      selectPart(isSelected ? null : part.id);
    };

    // Sliced main barrels intentionally skip StencilSectionCap so a solid-core lathe barrel
    // never plugs the hollow bore cavity covering `RiflingBoreActor`.
    const showSectionCap =
      isSectionCutShell &&
      !isBarrelRiflingCut &&
      !isXrayHousing &&
      !isGhostByIsolate &&
      sectionCutAxis !== 'box' &&
      !isThinWallCutawayShell(part.id);

    // 1:1 Heavy Armor & Blueprint Daylight physical surface calibration:
    // Firearms use gun-oil clearcoat & CLP iridescence (`nitride_steel` clearcoat=0.28),
    // which would wrap matte CARC-painted tank armor in wet plastic glare and create bright
    // specular fireflies on dark parkerized/nDLC receivers under full-sphere `blueprint_daylight` IBL.
    const resolvedClearcoat = daylightTuning.clearcoat;
    const resolvedClearcoatRoughness = daylightTuning.clearcoatRoughness;
    const resolvedIridescence = daylightTuning.iridescence;
    const resolvedSheen = isXrayHousing
      ? 0.32
      : isTank
        ? isTankBareMetal
          ? 0
          : 0.08
        : matCfg.sheen;
    const resolvedSheenRoughness = isXrayHousing
      ? 0.26
      : isTank
        ? 0.92
        : matCfg.sheenRoughness;
    const resolvedSheenColor = isXrayHousing
      ? '#38bdf8'
      : isTank
        ? '#7a7262'
        : matCfg.sheenColor;
    const resolvedEnvMapIntensity = daylightTuning.envMapIntensity;
    const resolvedAoMapIntensity = isGlbAsset
      ? isTank
        ? 1.26
        : 0.95
      : isMultiplicativeDetailMap
        ? 0.85
        : pbr.hasCustomAtlas
          ? 0.65
          : 0.48;

    const armoryMaterialProps = armoryActive
      ? {
          onBeforeCompile: armoryHooks.onBeforeCompile,
          customProgramCacheKey: armoryHooks.customProgramCacheKey,
          userData: armoryUserData,
        }
      : {};
    const depthMaterialProps =
      springDepthMaterial && armoryActive
        ? { customDepthMaterial: springDepthMaterial }
        : {};

    return (
      <>
        <group ref={groupRef}>
          <mesh
            name={part.id}
            geometry={geometry}
            raycast={sectionAwareMeshRaycast}
            renderOrder={meshRenderOrder}
            castShadow={!isTransparent}
            receiveShadow={!isTransparent}
            onPointerOver={handlePointerOver}
            onPointerMove={handlePointerMove}
            onPointerOut={handlePointerOut}
            onClick={handleClick}
            {...depthMaterialProps}
          >
            <meshPhysicalMaterial
              ref={matRef}
              key={matShaderKey}
              {...armoryMaterialProps}
              vertexColors={useVertexColors}
              color={isXrayHousing ? '#94a3b8' : '#ffffff'}
              map={activeMap}
              normalMap={activeNormalMap}
              normalScale={normalScaleVec}
              aoMap={activeOrmMap}
              aoMapIntensity={resolvedAoMapIntensity}
              roughnessMap={activeOrmMap}
              metalnessMap={activeMetalnessMap}
              metalness={
                isXrayHousing
                  ? 0.06
                  : activeMetalnessMap
                    ? isGlbAsset
                      ? 1.0
                      : isMultiplicativeDetailMap
                        ? 1.0
                        : 0.86
                    : matCfg.metalness
              }
              roughness={
                isXrayHousing
                  ? 0.16
                  : activeOrmMap
                    ? pbr.hasCustomAtlas
                      ? 1.0
                      : Math.min(1.0, matCfg.roughness / 0.88)
                    : matCfg.roughness
              }
              ior={isXrayHousing ? 1.48 : 1.5}
              clearcoat={resolvedClearcoat}
              clearcoatRoughness={resolvedClearcoatRoughness}
              iridescence={resolvedIridescence}
              iridescenceIOR={GUN_OIL_IRIDESCENCE_IOR}
              iridescenceThicknessRange={
                resolvedIridescence > 0
                  ? GUN_OIL_THICKNESS_RANGE
                  : NO_THICKNESS_RANGE
              }
              sheen={resolvedSheen}
              sheenRoughness={resolvedSheenRoughness}
              sheenColor={resolvedSheenColor}
              envMapIntensity={resolvedEnvMapIntensity}
              transparent={isTransparent}
              opacity={opacity}
              depthWrite={!isTransparent}
              polygonOffset={isTransparent}
              polygonOffsetFactor={isTransparent ? 1 : 0}
              polygonOffsetUnits={isTransparent ? 1 : 0}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
              clippingPlanes={isSectionCutShell ? activeClipPlanes : null}
              clipShadows={isSectionCutShell}
              side={isSectionCutShell ? THREE.DoubleSide : THREE.FrontSide}
            />

            {((showEdges && !isXrayHousing && !isSectionCutShell) ||
              isSelected) &&
              !isGhostByIsolate && (
                <Edges
                  threshold={44}
                  lineWidth={isSelected ? 1.25 : 0.9}
                  color={edgeColor}
                  renderOrder={isTransparent ? 13 : 2}
                />
              )}
            {isXrayHousing && !isGhostByIsolate && (
              <Edges
                threshold={42}
                lineWidth={0.85}
                color={isHovered ? '#0ea5e9' : '#0284c7'}
                transparent
                opacity={isHovered ? 0.62 : 0.36}
                depthWrite={false}
                renderOrder={13}
              />
            )}
          </mesh>
          {showSectionCap && (
            <StencilSectionCap
              geometry={geometry}
              material={part.material}
              group={part.group}
              partId={part.id}
              clippingPlanes={activeClipPlanes}
              engineeringRole={engineeringTint ? partRole : null}
              scaleProfile={
                getWeaponManifest(weaponId).workbenchMeta.scaleProfile
              }
              syncRef={capSyncRef}
            />
          )}
        </group>
      </>
    );
  }
);

PartActor.displayName = 'PartActor';
