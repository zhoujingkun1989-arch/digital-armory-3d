import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { useAppStore } from '../../store/useAppStore';
import type {
  MaterialKind,
  PartKinematicDelta,
  PbrBindingSpec,
  WeaponId,
  WeaponPartSpec,
} from '../../weapons/types';
import { playbackClock } from '../clock/playbackClock';
import { createMutablePose, evaluatePartPoseInto } from '../kinematics/math';
import {
  getPartPbrBundle,
  isTextureLoaded,
  subscribeTextureKeys,
} from '../materials/pbrManager';

const MATERIAL_CONFIGS: Record<
  MaterialKind,
  {
    metalness: number;
    roughness: number;
    clearcoat: number;
    clearcoatRoughness: number;
    envMapIntensity: number;
    edgeColor: string;
  }
> = {
  nitride_steel: {
    metalness: 0.52,
    roughness: 0.36,
    clearcoat: 0.24,
    clearcoatRoughness: 0.28,
    envMapIntensity: 1.55,
    edgeColor: '#475569',
  },
  barrel_steel: {
    metalness: 0.62,
    roughness: 0.28,
    clearcoat: 0.26,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.62,
    edgeColor: '#475569',
  },
  stainless: {
    metalness: 0.93,
    roughness: 0.18,
    clearcoat: 0.16,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.58,
    edgeColor: '#475569',
  },
  polymer_frame: {
    metalness: 0.04,
    roughness: 0.55,
    clearcoat: 0.12,
    clearcoatRoughness: 0.44,
    envMapIntensity: 1.25,
    edgeColor: '#334155',
  },
  spring_steel: {
    metalness: 0.84,
    roughness: 0.25,
    clearcoat: 0.18,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.5,
    edgeColor: '#475569',
  },
  follower_orange: {
    metalness: 0.04,
    roughness: 0.4,
    clearcoat: 0.14,
    clearcoatRoughness: 0.34,
    envMapIntensity: 1.15,
    edgeColor: '#9a3412',
  },
  copper_accent: {
    metalness: 0.93,
    roughness: 0.21,
    clearcoat: 0.18,
    clearcoatRoughness: 0.19,
    envMapIntensity: 1.52,
    edgeColor: '#78350f',
  },
};

// Module-pooled longitudinal section-cut plane (+Z right flank sliced open at z > +0.06; zero per-frame allocations)
const SECTION_CUT_PLANES: THREE.Plane[] = [
  new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.06),
];

function sectionAwareMeshRaycast(
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
    const poseRef = useRef(createMutablePose());

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
    const showEdges = useAppStore((s) => s.showEdges);
    const isGroupHidden = useAppStore((s) => s.hiddenGroups[part.group]);
    const selectPart = useAppStore((s) => s.selectPart);
    const hoverPart = useAppStore((s) => s.hoverPart);

    const matCfg = MATERIAL_CONFIGS[part.material];
    const pbr = useMemo(
      () => getPartPbrBundle(weaponId, part.material, customPbrBinding),
      [weaponId, part.material, customPbrBinding]
    );

    const [, setTexTick] = useState(0);
    useEffect(() => {
      return subscribeTextureKeys(pbr.textureKeys, () => {
        setTexTick((n) => n + 1);
      });
    }, [pbr.textureKeys]);

    const normalScaleVec = useMemo(
      () => new THREE.Vector2(pbr.normalScale, pbr.normalScale),
      [pbr.normalScale]
    );

    useFrame(() => {
      if (!groupRef.current) return;
      const clock = playbackClock.getState();
      const isFiring = useAppStore.getState().mode === 'firing';

      evaluatePartPoseInto(
        part,
        clock.animatedProgress,
        isFiring,
        clock.animatedFireProgress,
        computeKinematics,
        poseRef.current
      );

      const p = poseRef.current;
      groupRef.current.position.set(p.px, p.py, p.pz);
      groupRef.current.rotation.set(p.rx, p.ry, p.rz);
      groupRef.current.scale.set(p.sx, 1, 1);
    });

    if (!geometry || isGroupHidden) return null;

    const isXrayHousing = xrayShells && !!part.isShell && !isSelected;
    const isSectionCutShell = sectionCut && !!part.isShell && !isSelected;
    const isTransparent = isGhostByIsolate || isXrayHousing;

    const usePbrNow = pbrTexturesEnabled && !isXrayHousing;
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
    }

    const edgeColor = isSelected
      ? '#0284c7'
      : isHovered
        ? '#0ea5e9'
        : matCfg.edgeColor;

    const meshRenderOrder = isXrayHousing
      ? 12
      : isGhostByIsolate
        ? 11
        : 1;

    const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (useAppStore.getState().screen !== 'workbench') {
        document.body.style.cursor = 'pointer';
        return;
      }
      hoverPart(part.id);
      document.body.style.cursor = 'pointer';
    };

    const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (useAppStore.getState().hoveredPartId === part.id) {
        hoverPart(null);
      }
      document.body.style.cursor = 'auto';
    };

    const handleClick = (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const st = useAppStore.getState();
      if (st.screen !== 'workbench') {
        if (e.delta <= 5) {
          st.enterWorkbench(st.activeWeaponId);
        }
        return;
      }
      selectPart(isSelected ? null : part.id);
    };

    const matShaderKey = `${isXrayHousing ? 'x' : 's'}-${isSectionCutShell ? 'c1' : 'c0'}-${activeMap ? 'm1' : 'm0'}-${activeNormalMap ? 'n1' : 'n0'}-${activeOrmMap ? 'o1' : 'o0'}-${activeMetalnessMap ? 'mt1' : 'mt0'}`;

    return (
      <group ref={groupRef}>
        <mesh
          geometry={geometry}
          raycast={sectionAwareMeshRaycast}
          renderOrder={meshRenderOrder}
          castShadow={!isTransparent}
          receiveShadow={!isTransparent}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
          onClick={handleClick}
        >
          <meshPhysicalMaterial
            key={matShaderKey}
            vertexColors={useVertexColors}
            color={isXrayHousing ? '#94a3b8' : '#ffffff'}
            map={activeMap}
            normalMap={activeNormalMap}
            normalScale={normalScaleVec}
            aoMap={activeOrmMap}
            aoMapIntensity={pbr.hasCustomAtlas ? 0.65 : 0.48}
            roughnessMap={activeOrmMap}
            metalnessMap={activeMetalnessMap}
            metalness={
              isXrayHousing
                ? 0.06
                : activeMetalnessMap
                  ? 0.86
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
            clearcoat={isXrayHousing ? 0.36 : matCfg.clearcoat}
            clearcoatRoughness={
              isXrayHousing ? 0.14 : matCfg.clearcoatRoughness
            }
            sheen={isXrayHousing ? 0.32 : 0}
            sheenRoughness={isXrayHousing ? 0.26 : 0.5}
            sheenColor={isXrayHousing ? '#38bdf8' : '#000000'}
            envMapIntensity={isXrayHousing ? 0.54 : matCfg.envMapIntensity}
            transparent={isTransparent}
            opacity={opacity}
            depthWrite={!isTransparent}
            polygonOffset={isTransparent}
            polygonOffsetFactor={isTransparent ? 1 : 0}
            polygonOffsetUnits={isTransparent ? 1 : 0}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
            clippingPlanes={isSectionCutShell ? SECTION_CUT_PLANES : null}
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
      </group>
    );
  }
);

PartActor.displayName = 'PartActor';
