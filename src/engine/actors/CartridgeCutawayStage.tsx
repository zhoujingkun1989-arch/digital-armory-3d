import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { useAppStore } from '../../store/useAppStore';
import type { CaliberProfile } from '../../weapons/types';
import {
  CARTRIDGE_LAB_ORDER,
  CARTRIDGE_LAB_SPECS,
  getCartridgeLabMeshBundle,
} from '../cartridges/cartridgeSpecs';

/** Vertical datum floor of the 1:1 Cartridge Cutaway Lab (`y = -3.8 cm` in world space) */
export const CARTRIDGE_STAGE_DATUM_Y = -3.8;

const PLINTH_GEO = new THREE.BoxGeometry(44, 0.85, 11.5);
const PEDESTAL_DISC_GEO = new THREE.CylinderGeometry(1.42, 1.56, 0.16, 36);
const ACTIVE_HALO_GEO = (() => {
  const g = new THREE.RingGeometry(1.52, 1.78, 40);
  g.rotateX(-Math.PI / 2);
  return g;
})();

/**
 * Builds the 1:1 CNC elevation backdrop ruler (`0 mm` to `150 mm` = `0` to `15.0` world units)
 * behind the 7-caliber lineup (`z = -2.4 cm`), with `10 mm` (`1 cm`) horizontal hairlines
 * and `50 mm` (`5 cm`) major datum rules.
 */
function buildElevationScaleBackdrop(): {
  minorGeo: THREE.BufferGeometry;
  majorGeo: THREE.BufferGeometry;
} {
  const minorVerts: number[] = [];
  const majorVerts: number[] = [];
  const xLeft = -19.2;
  const xRight = 22.4;
  const zPlane = -2.35;

  // Vertical left & right stiles
  majorVerts.push(xLeft, 0, zPlane, xLeft, 15.2, zPlane);
  majorVerts.push(xRight, 0, zPlane, xRight, 15.2, zPlane);

  for (let cm = 0; cm <= 15; cm++) {
    const isMajor50mm = cm % 5 === 0;
    const target = isMajor50mm ? majorVerts : minorVerts;
    target.push(xLeft, cm, zPlane, xRight, cm, zPlane);

    // Precision 5mm half-centimeter ticks on left/right stiles
    if (cm < 15) {
      const halfY = cm + 0.5;
      minorVerts.push(xLeft, halfY, zPlane, xLeft + 0.45, halfY, zPlane);
      minorVerts.push(xRight - 0.45, halfY, zPlane, xRight, halfY, zPlane);
    }
  }

  const minorGeo = new THREE.BufferGeometry();
  minorGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(minorVerts, 3)
  );

  const majorGeo = new THREE.BufferGeometry();
  majorGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(majorVerts, 3)
  );

  return { minorGeo, majorGeo };
}

const BACKDROP_SCALE_GEOS = buildElevationScaleBackdrop();

interface SingleCartridgeSpecimenProps {
  caliber: CaliberProfile;
  cutaway: boolean;
  isActive: boolean;
  showEdges: boolean;
  onSelect: (caliber: CaliberProfile) => void;
}

const SingleCartridgeSpecimen: React.FC<SingleCartridgeSpecimenProps> =
  React.memo(({ caliber, cutaway, isActive, showEdges, onSelect }) => {
    const spec = CARTRIDGE_LAB_SPECS[caliber];
    const bundle = useMemo(
      () => getCartridgeLabMeshBundle(caliber, cutaway),
      [caliber, cutaway]
    );

    const primerRef = useRef<THREE.Mesh>(null);
    const anvilRef = useRef<THREE.Mesh>(null);
    const propellantRef = useRef<THREE.Mesh>(null);
    const jacketRef = useRef<THREE.Mesh>(null);
    const penetratorRef = useRef<THREE.Mesh>(null);
    const coreSlugRef = useRef<THREE.Mesh>(null);
    const haloRef = useRef<THREE.Mesh>(null);

    const animExplodeRef = useRef(0);

    useFrame((_, delta) => {
      const targetExplode = useAppStore.getState().cartridgeExplodeProgress;
      const dt = Math.min(delta, 0.05);
      const t = THREE.MathUtils.damp(
        animExplodeRef.current,
        targetExplode,
        9.5,
        dt
      );
      animExplodeRef.current = t;

      const caseH = spec.caseLengthMm / 10;
      const scaleSpan = Math.max(0.75, caseH * 0.32);

      if (primerRef.current) {
        primerRef.current.position.y = -t * (0.95 + scaleSpan * 0.35);
      }
      if (anvilRef.current) {
        anvilRef.current.position.y = -t * (0.48 + scaleSpan * 0.18);
      }
      if (propellantRef.current) {
        propellantRef.current.position.y = t * scaleSpan * 0.42;
      }
      if (jacketRef.current) {
        jacketRef.current.position.y = t * scaleSpan * 1.15;
      }
      if (coreSlugRef.current) {
        coreSlugRef.current.position.y = t * scaleSpan * 1.72;
      }
      if (penetratorRef.current) {
        penetratorRef.current.position.y = t * scaleSpan * 2.28;
      }
      if (haloRef.current && isActive) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.0045);
        haloRef.current.scale.setScalar(0.98 + 0.05 * pulse);
      }
    });

    const handleClick = (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta <= 6) {
        onSelect(caliber);
      }
    };

    const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      document.body.style.cursor = 'pointer';
    };

    const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      document.body.style.cursor = 'auto';
    };

    return (
      <group
        position={[spec.lineupXCm, 0, 0]}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        {/* Datum Pedestal Disc */}
        <mesh
          geometry={PEDESTAL_DISC_GEO}
          position={[0, -0.08, 0]}
          receiveShadow
        >
          <meshStandardMaterial
            color={isActive ? '#1e293b' : '#0f172a'}
            metalness={0.72}
            roughness={0.34}
            emissive={isActive ? '#0284c7' : '#000000'}
            emissiveIntensity={isActive ? 0.24 : 0}
          />
        </mesh>

        {isActive && (
          <mesh
            ref={haloRef}
            geometry={ACTIVE_HALO_GEO}
            position={[0, 0.015, 0]}
            renderOrder={12}
          >
            <meshBasicMaterial
              color="#38bdf8"
              transparent
              opacity={0.85}
              side={THREE.DoubleSide}
            />
          </mesh>
        )}

        {/* 1. Drawn C26000 Brass Cartridge Case + Flash Hole */}
        <mesh geometry={bundle.caseGeo} castShadow receiveShadow>
          <meshPhysicalMaterial
            color={spec.caseColor}
            metalness={0.9}
            roughness={0.22}
            clearcoat={0.18}
            clearcoatRoughness={0.2}
            emissive={isActive ? '#0ea5e9' : '#000000'}
            emissiveIntensity={isActive ? 0.06 : 0}
          />
          {(showEdges || isActive) && (
            <Edges
              threshold={42}
              lineWidth={isActive ? 1.05 : 0.75}
              color={isActive ? '#38bdf8' : '#78350f'}
            />
          )}
        </mesh>

        {/* 2. Nickel-Plated Boxer Primer Cup */}
        <mesh ref={primerRef} geometry={bundle.primerCupGeo} castShadow>
          <meshPhysicalMaterial
            color="#e2e8f0"
            metalness={0.94}
            roughness={0.18}
            clearcoat={0.15}
          />
        </mesh>

        {/* 3. Brass Boxer Anvil */}
        <mesh ref={anvilRef} geometry={bundle.anvilGeo}>
          <meshStandardMaterial
            color="#f59e0b"
            metalness={0.85}
            roughness={0.28}
          />
        </mesh>

        {/* 4. Granular Smokeless Propellant Charge Column */}
        <mesh ref={propellantRef} geometry={bundle.propellantGeo}>
          <meshStandardMaterial
            color={spec.propellantColor}
            metalness={0.08}
            roughness={0.88}
          />
        </mesh>

        {/* 5. Gilding-Metal / Copper Projectile Jacket */}
        <mesh ref={jacketRef} geometry={bundle.jacketGeo} castShadow>
          <meshPhysicalMaterial
            color={spec.jacketColor}
            metalness={0.92}
            roughness={0.21}
            clearcoat={0.16}
            clearcoatRoughness={0.18}
          />
          {showEdges && <Edges threshold={42} lineWidth={0.75} color="#7c2d12" />}
        </mesh>

        {/* 6. Rear Lead / Steel Core Slug */}
        <mesh ref={coreSlugRef} geometry={bundle.coreSlugGeo}>
          <meshStandardMaterial
            color={spec.coreSlugColor}
            metalness={0.76}
            roughness={0.42}
          />
        </mesh>

        {/* 7. Forward Hardened Steel Penetrator Tip (M855 / SS190) */}
        {bundle.penetratorGeo && (
          <mesh ref={penetratorRef} geometry={bundle.penetratorGeo}>
            <meshPhysicalMaterial
              color={spec.penetratorColor}
              metalness={0.95}
              roughness={0.16}
              clearcoat={0.2}
            />
          </mesh>
        )}
      </group>
    );
  });

SingleCartridgeSpecimen.displayName = 'SingleCartridgeSpecimen';

/**
 * WP-06 — 1:1 SAAMI / CIP Cartridge Cutaway Lab Stage
 * ---------------------------------------------------
 * Displays all 7 arsenal calibers (`9×19mm` through `.50 BMG`) side-by-side at
 * exact `1:1` physical scale (`1 world unit = 1 cm = 10 mm`) with longitudinal
 * `180°` cutaway anatomy and a `0–150 mm` CNC elevation ruler backdrop.
 */
export const CartridgeCutawayStage: React.FC = () => {
  const screen = useAppStore((s) => s.screen);
  const activeCaliber = useAppStore((s) => s.activeCartridgeCaliber);
  const cutaway = useAppStore((s) => s.cartridgeSectionCut);
  const showEdges = useAppStore((s) => s.showEdges);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const selectLabCartridge = useAppStore((s) => s.selectLabCartridge);

  if (screen !== 'cartridges') return null;

  const isDaylight = environmentPreset === 'blueprint_daylight';

  return (
    <group position={[0, CARTRIDGE_STAGE_DATUM_Y, 0]}>
      {/* Machined CNC Datum Exhibition Plinth */}
      <mesh
        geometry={PLINTH_GEO}
        position={[1.6, -0.52, -0.2]}
        receiveShadow
      >
        <meshStandardMaterial
          color={isDaylight ? '#cbd5e1' : '#0b1120'}
          metalness={isDaylight ? 0.25 : 0.68}
          roughness={isDaylight ? 0.58 : 0.36}
        />
      </mesh>

      {/* 0–150 mm (0–15 cm) 1:1 Elevation Scale Grid Backdrop */}
      <lineSegments geometry={BACKDROP_SCALE_GEOS.minorGeo}>
        <lineBasicMaterial
          color={isDaylight ? '#64748b' : '#334155'}
          transparent
          opacity={0.42}
        />
      </lineSegments>
      <lineSegments geometry={BACKDROP_SCALE_GEOS.majorGeo}>
        <lineBasicMaterial
          color={isDaylight ? '#0284c7' : '#38bdf8'}
          transparent
          opacity={0.62}
        />
      </lineSegments>

      {/* 7 Side-by-Side 1:1 SAAMI/CIP Cartridges */}
      {CARTRIDGE_LAB_ORDER.map((caliber) => (
        <SingleCartridgeSpecimen
          key={caliber}
          caliber={caliber}
          cutaway={cutaway}
          isActive={caliber === activeCaliber}
          showEdges={showEdges}
          onSelect={(cal) => selectLabCartridge(cal, true)}
        />
      ))}
    </group>
  );
};

CartridgeCutawayStage.displayName = 'CartridgeCutawayStage';
