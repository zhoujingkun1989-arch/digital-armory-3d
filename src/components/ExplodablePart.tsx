import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import {
  computePartTransform,
  G17PartSpec,
  MaterialKind,
} from '../data/g17PartsSpec';
import { computeWeaponFiringKinematics } from '../data/weaponRegistry';
import { getPartGeometry } from '../geometry/partGeometryRegistry';
import {
  getPartPbrBundle,
  isTextureLoaded,
  subscribePbrTextureReady,
} from '../geometry/pbrTextures';
import { useExplodeStore } from '../store/useExplodeStore';

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
    metalness: 0.72,
    roughness: 0.28,
    clearcoat: 0.3,
    clearcoatRoughness: 0.25,
    envMapIntensity: 1.42,
    edgeColor: '#1e293b',
  },
  barrel_steel: {
    metalness: 0.78,
    roughness: 0.22,
    clearcoat: 0.35,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.48,
    edgeColor: '#1e293b',
  },
  stainless: {
    metalness: 0.86,
    roughness: 0.19,
    clearcoat: 0.24,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.48,
    edgeColor: '#334155',
  },
  polymer_frame: {
    metalness: 0.05,
    roughness: 0.64,
    clearcoat: 0.03,
    clearcoatRoughness: 0.68,
    envMapIntensity: 0.94,
    edgeColor: '#1e293b',
  },
  spring_steel: {
    metalness: 0.84,
    roughness: 0.23,
    clearcoat: 0.2,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.42,
    edgeColor: '#334155',
  },
  follower_orange: {
    metalness: 0.06,
    roughness: 0.36,
    clearcoat: 0.24,
    clearcoatRoughness: 0.34,
    envMapIntensity: 1.08,
    edgeColor: '#9a3412',
  },
  copper_accent: {
    metalness: 0.86,
    roughness: 0.24,
    clearcoat: 0.25,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.45,
    edgeColor: '#78350f',
  },
};

interface ExplodablePartProps {
  part: G17PartSpec;
  animatedProgressRef: React.MutableRefObject<number>;
  animatedFirePhaseRef: React.MutableRefObject<number>;
}

export const ExplodablePart: React.FC<ExplodablePartProps> = ({
  part,
  animatedProgressRef,
  animatedFirePhaseRef,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => getPartGeometry(part.id), [part.id]);

  const screen = useExplodeStore((s) => s.screen);
  const pbrTexturesEnabled = useExplodeStore((s) => s.pbrTexturesEnabled);
  const selectedPartId = useExplodeStore((s) => s.selectedPartId);
  const hoveredPartId = useExplodeStore((s) => s.hoveredPartId);
  const xrayShells = useExplodeStore((s) => s.xrayShells);
  const showEdges = useExplodeStore((s) => s.showEdges);
  const isolateSelected = useExplodeStore((s) => s.isolateSelected);
  const isGroupHidden = useExplodeStore((s) => s.hiddenGroups[part.group]);
  const selectPart = useExplodeStore((s) => s.selectPart);
  const hoverPart = useExplodeStore((s) => s.hoverPart);

  const [, setTexTick] = useState(0);
  useEffect(() => {
    return subscribePbrTextureReady(() => {
      setTexTick((n) => n + 1);
    });
  }, []);

  const isSelected = screen === 'workbench' && selectedPartId === part.id;
  const isHovered = screen === 'workbench' && hoveredPartId === part.id;

  const matCfg = MATERIAL_CONFIGS[part.material];
  const pbr = useMemo(
    () => getPartPbrBundle(part.id, part.material),
    [part.id, part.material]
  );

  const normalScaleVec = useMemo(
    () => new THREE.Vector2(pbr.normalScale, pbr.normalScale),
    [pbr.normalScale]
  );

  const isGhostByIsolate =
    isolateSelected && selectedPartId !== null && !isSelected;
  const isXrayHousing = xrayShells && !!part.isShell && !isSelected;
  const isTransparent = isGhostByIsolate || isXrayHousing;

  const usePbrNow = pbrTexturesEnabled && !isXrayHousing;
  const albedoReady = usePbrNow && pbr.hasCustomAtlas && isTextureLoaded(pbr.map);
  const normalReady = usePbrNow && isTextureLoaded(pbr.normalMap);
  const roughReady = usePbrNow && isTextureLoaded(pbr.roughnessMap);

  const activeMap = albedoReady ? pbr.map : null;
  const activeNormalMap = normalReady ? pbr.normalMap : null;
  const activeRoughnessMap = roughReady ? pbr.roughnessMap : null;
  const useVertexColors = !isXrayHousing && !albedoReady;

  let opacity = 1.0;
  if (isGhostByIsolate) opacity = 0.09;
  else if (isXrayHousing) opacity = 0.16;

  let emissive = '#000000';
  let emissiveIntensity = 0;
  if (isSelected) {
    emissive = '#0284c7';
    emissiveIntensity = 0.28;
  } else if (isHovered && !isGhostByIsolate) {
    emissive = '#0ea5e9';
    emissiveIntensity = 0.16;
  }

  const edgeColor = isSelected
    ? '#0284c7'
    : isHovered
      ? '#0ea5e9'
      : matCfg.edgeColor;

  useFrame(() => {
    if (!groupRef.current) return;
    const t = animatedProgressRef.current;
    const { position, rotation } = computePartTransform(part, t);

    let px = position[0];
    let py = position[1];
    let pz = position[2];
    let rx = rotation[0];
    let ry = rotation[1];
    let rz = rotation[2];
    let sx = 1;

    const st = useExplodeStore.getState();
    if (st.mode === 'firing') {
      const f = animatedFirePhaseRef.current;
      const kin = computeWeaponFiringKinematics(st.activeWeaponId, part.id, f);
      px += kin.pos[0];
      py += kin.pos[1];
      pz += kin.pos[2];
      rx += kin.rot[0];
      ry += kin.rot[1];
      rz += kin.rot[2];
      sx = kin.scaleX;
    }

    groupRef.current.position.set(px, py, pz);
    groupRef.current.rotation.set(rx, ry, rz);
    groupRef.current.scale.set(sx, 1, 1);
  });

  if (isGroupHidden) return null;

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (useExplodeStore.getState().screen === 'armory') {
      document.body.style.cursor = 'pointer';
      return;
    }
    hoverPart(part.id);
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (useExplodeStore.getState().hoveredPartId === part.id) {
      hoverPart(null);
    }
    document.body.style.cursor = 'auto';
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (useExplodeStore.getState().screen === 'armory') {
      if (e.delta <= 5) {
        useExplodeStore
          .getState()
          .enterWorkbench(useExplodeStore.getState().activeWeaponId);
      }
      return;
    }
    selectPart(isSelected ? null : part.id);
  };

  // Unique material key ensures clean shader recompilation when toggling X-ray or PBR maps
  const matShaderKey = `${isXrayHousing ? 'x' : 's'}-${activeMap ? 'm1' : 'm0'}-${activeNormalMap ? 'n1' : 'n0'}-${activeRoughnessMap ? 'r1' : 'r0'}`;

  return (
    <group ref={groupRef}>
      <mesh
        geometry={geometry}
        renderOrder={isTransparent ? 10 : 1}
        castShadow={!isTransparent}
        receiveShadow={!isTransparent}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <meshPhysicalMaterial
          key={matShaderKey}
          vertexColors={useVertexColors}
          color={isXrayHousing ? '#64748b' : '#ffffff'}
          map={activeMap}
          normalMap={activeNormalMap}
          normalScale={normalScaleVec}
          roughnessMap={activeRoughnessMap}
          metalness={isXrayHousing ? 0.18 : matCfg.metalness}
          roughness={
            isXrayHousing
              ? 0.32
              : activeRoughnessMap
                ? 1.0
                : matCfg.roughness
          }
          clearcoat={isXrayHousing ? 0.1 : matCfg.clearcoat}
          clearcoatRoughness={matCfg.clearcoatRoughness}
          envMapIntensity={matCfg.envMapIntensity}
          transparent={isTransparent}
          opacity={opacity}
          depthWrite={!isTransparent}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          side={isTransparent ? THREE.DoubleSide : THREE.FrontSide}
        />

        {((showEdges && !isXrayHousing) || isSelected) && !isGhostByIsolate && (
          <Edges
            threshold={46}
            color={edgeColor}
            renderOrder={isTransparent ? 11 : 2}
          />
        )}
        {isXrayHousing && !isGhostByIsolate && (
          <Edges threshold={48} color="#0284c7" renderOrder={11} />
        )}
      </mesh>
    </group>
  );
};
