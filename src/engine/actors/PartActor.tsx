import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import type {
  MaterialKind,
  PartKinematicDelta,
  PbrBindingSpec,
  WeaponId,
  WeaponPartSpec,
} from '../../weapons/types';
import { playbackClock } from '../clock/playbackClock';
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
  computeThermalSpanInto,
  createArmoryMaterialHooks,
  createArmoryShaderUniforms,
  createArmorySpringDepthMaterial,
  getArmoryProgramCacheKey,
  getArmoryWearLevel,
  resolveArmoryShaderFeatures,
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
  isTextureLoaded,
  subscribeTextureKeys,
} from '../materials/pbrManager';
import {
  SECTION_CUT_BOX_PLANES,
  SECTION_CUT_PLANES,
  type SectionCapSyncFn,
  StencilSectionCap,
  disposeSectionStencilPassMaterials,
  syncCantedLocalZSectionPlane,
} from './StencilSectionCap';

export { SECTION_CUT_PLANES };

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
    const engineeringTint = useAppStore((s) => s.engineeringTint);
    const focusedEngineeringRole = useAppStore((s) => s.focusedEngineeringRole);
    const isGroupHidden = useAppStore((s) => s.hiddenGroups[part.group]);
    const isReplacedByAttachment = useAttachmentStore((s) =>
      selectIsPartReplacedByAttachment(s, weaponId, part.id)
    );
    const selectPart = useAppStore((s) => s.selectPart);
    const hoverPart = useAppStore((s) => s.hoverPart);

    const isTank =
      getWeaponManifest(weaponId).workbenchMeta.scaleProfile ===
      'main_battle_tank';
    const surfaceScale = isTank ? 10 : 1;

    const partRole = useMemo(
      () => resolvePartEngineeringRole(weaponId, part),
      [weaponId, part]
    );

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

    const normalScaleVec = useMemo(
      () => new THREE.Vector2(pbr.normalScale, pbr.normalScale),
      [pbr.normalScale]
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

    const isXrayHousing = xrayShells && !!part.isShell && !isSelected;
    const usePbrNow = pbrTexturesEnabled && !isXrayHousing;
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
    // Canted shell parts (e.g. AN-94 15°-canted plum magazine) slice along their own tilted local Z=0 symmetry plane in Z-axis mode
    const isCantedShell =
      sectionCutAxis === 'z' &&
      !!part.isShell &&
      Math.abs(part.assembledRot?.[0] ?? 0) > 1e-4;
    const activeClipPlanes = useMemo(() => {
      if (sectionCutAxis === 'box') return SECTION_CUT_BOX_PLANES;
      return isCantedShell
        ? [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)]
        : SECTION_CUT_PLANES;
    }, [isCantedShell, sectionCutAxis]);
    useEffect(() => {
      if (!isCantedShell) return;
      return () => disposeSectionStencilPassMaterials(activeClipPlanes);
    }, [isCantedShell, activeClipPlanes]);

    useFrame(() => {
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
        } else if (hadTransientHighlightRef.current) {
          mat.emissive.set(baseEmissiveRef.current);
          mat.emissiveIntensity = baseEmissiveIntensityRef.current;
          hadTransientHighlightRef.current = false;
        }
      }

      const syncCap = capSyncRef.current;
      if (isCantedShell || syncCap) {
        grp.updateWorldMatrix(true, false);
        if (isCantedShell) {
          syncCantedLocalZSectionPlane(
            grp.matrixWorld,
            SECTION_CUT_PLANES[0],
            activeClipPlanes[0]
          );
        }
        if (syncCap) {
          syncCap(grp);
        }
      }
    });

    if (!geometry || isGroupHidden || isReplacedByAttachment) return null;

    const isSectionCutShell = sectionCut && !!part.isShell && !isSelected;
    const isTransparent = isGhostByIsolate || isXrayHousing;

    const albedoReady =
      usePbrNow && pbr.hasCustomAtlas && isTextureLoaded(pbr.map);
    const normalReady = usePbrNow && isTextureLoaded(pbr.normalMap);
    const roughReady = usePbrNow && isTextureLoaded(pbr.roughnessMap);

    const activeMap = albedoReady ? pbr.map : null;
    const activeNormalMap = normalReady ? pbr.normalMap : null;
    const activeOrmMap = roughReady ? pbr.roughnessMap : null;
    const activeMetalnessMap =
      pbr.hasCustomAtlas && activeOrmMap ? activeOrmMap : null;
    const useVertexColors = !isXrayHousing && !albedoReady;

    // Optical X-ray clarity: ultra-low front-face haze + clean depth sorting (renderOrder 12)
    // keeps internal springs, locking rollers, gas pistons, and FCG sears razor-sharp!
    let opacity = 1.0;
    if (isGhostByIsolate) opacity = 0.075;
    else if (isXrayHousing) opacity = isHovered ? 0.135 : 0.095;

    let emissive = '#000000';
    let emissiveIntensity = 0;
    if (isSelected) {
      emissive = '#0284c7';
      emissiveIntensity = 0.28;
    } else if (isHovered && !isGhostByIsolate) {
      emissive = '#0ea5e9';
      emissiveIntensity = isXrayHousing ? 0.1 : 0.16;
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
      ? '#0284c7'
      : isHovered
        ? '#0ea5e9'
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
      document.body.style.cursor = st.caliperActive ? 'crosshair' : 'pointer';
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
      document.body.style.cursor = 'auto';
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

    // Armory shader stays off on optical X-ray housings (clean glass look), except springs
    const armoryActive = !isXrayHousing || armoryFeatures.spring;
    const showSectionCap =
      isSectionCutShell &&
      !isXrayHousing &&
      !isGhostByIsolate &&
      sectionCutAxis !== 'box';

    // 1:1 Heavy Armor physical surface calibration:
    // Firearms use gun-oil clearcoat & CLP iridescence (`nitride_steel` clearcoat=0.28),
    // which would wrap matte CARC-painted tank armor in wet plastic glare! On Main Battle Tanks,
    // matte painted armor obeys the Cycles-baked ORM roughness/metalness directly with subtle
    // dry mineral dust grazing sheen, while machined bare steel/chrome/brass stays crisp.
    const isTankBareMetal =
      isTank &&
      (part.material === 'stainless' ||
        part.material === 'copper_accent' ||
        part.material === 'spring_steel');
    const isTankOrdnanceBarrel = isTank && part.material === 'barrel_steel';
    const resolvedClearcoat = isXrayHousing
      ? 0.36
      : isTank
        ? isTankBareMetal
          ? 0.06
          : isTankOrdnanceBarrel
            ? 0.04
            : 0.0
        : matCfg.clearcoat;
    const resolvedClearcoatRoughness = isXrayHousing
      ? 0.14
      : isTank
        ? 0.38
        : matCfg.clearcoatRoughness;
    const resolvedIridescence =
      isXrayHousing || isTank ? 0 : matCfg.iridescence;
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
    const resolvedEnvMapIntensity = isXrayHousing
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
    const resolvedAoMapIntensity = isGlbAsset
      ? isTank
        ? 1.26
        : 0.95
      : pbr.hasCustomAtlas
        ? 0.65
        : 0.48;

    const matShaderKey = `${isXrayHousing ? 'x' : 's'}-${isTank ? 't1' : 't0'}-${isSectionCutShell ? (sectionCutAxis === 'box' ? 'cb' : 'c1') : 'c0'}-${isGlbAsset ? 'g1' : 'g0'}-${activeMap ? 'm1' : 'm0'}-${activeNormalMap ? 'n1' : 'n0'}-${activeOrmMap ? 'o1' : 'o0'}-${activeMetalnessMap ? 'mt1' : 'mt0'}-${armoryActive ? getArmoryProgramCacheKey(armoryFeatures) : 'plain'}`;

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
