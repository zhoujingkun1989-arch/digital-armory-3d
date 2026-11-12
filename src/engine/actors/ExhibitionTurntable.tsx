import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import type { WeaponId } from '../../weapons/types';
import { playbackClock } from '../clock/playbackClock';
import {
  evaluateWeaponTurntableEnvelopeInto,
  getTurntableRadius,
} from '../canvas/turntableStageMetrics';

const noopRaycast: THREE.Object3D['raycast'] = () => {};

function buildVernierTicksGeometry(radius: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];

  const cyan = new THREE.Color('#0284c7');
  const majorSlate = new THREE.Color('#334155');
  const minorSlate = new THREE.Color('#94a3b8');
  const crossSlate = new THREE.Color('#cbd5e1');

  const y = 0.012;

  // 72 radial azimuth graduation ticks (5° vernier scale)
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = THREE.MathUtils.degToRad(deg);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const isCardinal = deg % 90 === 0;
    const isMajor = deg % 30 === 0;

    const rOuter = radius * 0.958;
    const rInner = isCardinal
      ? radius * 0.835
      : isMajor
        ? radius * 0.875
        : radius * 0.915;

    const c = isCardinal ? cyan : isMajor ? majorSlate : minorSlate;

    positions.push(
      cos * rInner,
      y,
      sin * rInner,
      cos * rOuter,
      y,
      sin * rOuter
    );
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }

  // Subtle central metrology crosshairs along ±X and ±Z
  const rCrossInner = radius * 0.14;
  const rCrossOuter = radius * 0.56;
  const axes: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [ax, az] of axes) {
    positions.push(
      ax * rCrossInner,
      y * 0.7,
      az * rCrossInner,
      ax * rCrossOuter,
      y * 0.7,
      az * rCrossOuter
    );
    colors.push(
      crossSlate.r,
      crossSlate.g,
      crossSlate.b,
      crossSlate.r,
      crossSlate.g,
      crossSlate.b
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

export interface ExhibitionTurntableProps {
  weaponId: WeaponId;
}

export const ExhibitionTurntable: React.FC<ExhibitionTurntableProps> =
  React.memo(({ weaponId }) => {
    const screen = useAppStore((s) => s.screen);
    const groupRef = useRef<THREE.Group>(null);

    const radius = getTurntableRadius(weaponId);

    const ticksGeo = useMemo(() => buildVernierTicksGeometry(radius), [radius]);

    useEffect(() => {
      return () => {
        ticksGeo.dispose();
      };
    }, [ticksGeo]);

    useFrame(() => {
      if (!groupRef.current) return;
      const st = useAppStore.getState();
      if (st.screen === 'workbench') return;
      const env = evaluateWeaponTurntableEnvelopeInto(
        st.activeWeaponId,
        playbackClock.getState().animatedProgress
      );
      groupRef.current.position.set(env.cx, env.platterTopY, 0);
    });

    if (screen === 'workbench') return null;

    const initialEnv = evaluateWeaponTurntableEnvelopeInto(weaponId, 0);

    return (
      <group
        ref={groupRef}
        position={[initialEnv.cx, initialEnv.platterTopY, 0]}
      >
        {/* Top satin metrology platter (receives crisp firearm studio shadow) */}
        <mesh position={[0, -0.15, 0]} receiveShadow raycast={noopRaycast}>
          <cylinderGeometry args={[radius, radius * 1.014, 0.3, 96]} />
          <meshPhysicalMaterial
            color="#f8fafc"
            roughness={0.44}
            metalness={0.14}
            clearcoat={0.22}
            clearcoatRoughness={0.32}
            envMapIntensity={0.85}
          />
        </mesh>

        {/* Anodized dark-slate bevelled chassis skirt */}
        <mesh position={[0, -0.42, 0]} raycast={noopRaycast}>
          <cylinderGeometry args={[radius * 1.016, radius * 1.045, 0.26, 96]} />
          <meshStandardMaterial
            color="#334155"
            roughness={0.34}
            metalness={0.68}
          />
        </mesh>

        {/* Outer precision cyan calibration ring */}
        <mesh
          position={[0, 0.008, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={noopRaycast}
        >
          <ringGeometry args={[radius * 0.962, radius * 0.982, 96]} />
          <meshBasicMaterial
            color="#0284c7"
            transparent
            opacity={0.58}
            depthWrite={false}
          />
        </mesh>

        {/* Inner concentric reference ring */}
        <mesh
          position={[0, 0.007, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={noopRaycast}
        >
          <ringGeometry args={[radius * 0.6, radius * 0.612, 96]} />
          <meshBasicMaterial
            color="#94a3b8"
            transparent
            opacity={0.45}
            depthWrite={false}
          />
        </mesh>

        {/* 72 radial vernier degree ticks + axis crosshairs */}
        <lineSegments geometry={ticksGeo} raycast={noopRaycast}>
          <lineBasicMaterial vertexColors transparent opacity={0.85} />
        </lineSegments>
      </group>
    );
  });

ExhibitionTurntable.displayName = 'ExhibitionTurntable';
