import React, {
  type ComponentRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Camera, Pause, Play, RotateCcw } from 'lucide-react';
import { ViewportErrorBoundary } from '../../app/ViewportErrorBoundary';
import type {
  ArmorPenetrationResult,
  PenetratorId,
} from '../../engine/physics/armorPenetration';
import type { LanguageCode } from '../../narration/types';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { ARMOR_PENETRATION_STRINGS } from './armorPenetrationStrings';
import {
  type ArmorLayerLayout,
  type ArmorTheaterFrameState,
  type ArmorTheaterLayout,
  buildArmorTheaterLayout,
  createArmorTheaterFrameState,
  evaluateArmorTheaterFrameInto,
  evaluateSpallParticleInto,
  evaluateSparkParticleInto,
  type ParticleTransformOut,
  SPALL_PARTICLE_COUNT,
  SPARK_PARTICLE_COUNT,
  THEATER_T_IMPACT,
  THEATER_T_PERFORATION_EXIT,
  type TheaterPhase,
  type TheaterPlaybackSpeed,
} from './armorPenetration3DMath';

export interface ArmorPenetration3DSceneProps {
  result: ArmorPenetrationResult;
  lang: LanguageCode;
  compact?: boolean;
}

const PLAYBACK_SPEEDS: readonly TheaterPlaybackSpeed[] = [0.15, 0.5, 1];
const BASE_CYCLE_DURATION_SEC = 3.6;
const TERMINAL_HOLD_SEC = 0.9;

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

interface ArmorTheaterClock {
  step: (dt: number) => number;
  setProgress: (p: number) => void;
  setSpeed: (s: TheaterPlaybackSpeed) => void;
  setScrubbing: (scrubbing: boolean) => void;
  togglePlaying: () => void;
  pause: () => void;
  resetAndPlay: () => void;
  getPlaying: () => boolean;
  subscribePlaying: (listener: () => void) => () => void;
}

function createArmorTheaterClock(): ArmorTheaterClock {
  let progress = 0;
  let playing = true;
  let speed: TheaterPlaybackSpeed = 0.5;
  let scrubbing = false;
  let holdTimer = 0;
  const listeners = new Set<() => void>();

  const emit = () => {
    listeners.forEach((fn) => fn());
  };

  return {
    step(dt: number): number {
      if (playing && !scrubbing) {
        if (progress >= 1) {
          holdTimer += dt;
          if (holdTimer >= TERMINAL_HOLD_SEC) {
            progress = 0;
            holdTimer = 0;
          }
        } else {
          const nextP = progress + (dt * speed) / BASE_CYCLE_DURATION_SEC;
          progress = nextP >= 1 ? 1 : nextP;
        }
      }
      return progress;
    },
    setProgress(p: number): void {
      progress = Math.max(0, Math.min(1, p));
      holdTimer = 0;
    },
    setSpeed(s: TheaterPlaybackSpeed): void {
      speed = s;
    },
    setScrubbing(v: boolean): void {
      scrubbing = v;
    },
    togglePlaying(): void {
      const next = !playing;
      if (next && progress >= 0.995) {
        progress = 0;
        holdTimer = 0;
      }
      playing = next;
      emit();
    },
    pause(): void {
      if (!playing) return;
      playing = false;
      emit();
    },
    resetAndPlay(): void {
      progress = 0;
      holdTimer = 0;
      if (!playing) {
        playing = true;
        emit();
      }
    },
    getPlaying(): boolean {
      return playing;
    },
    subscribePlaying(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Pre-allocated Zero-GC scratch objects shared inside `useFrame`. */
const _scratchMatrix = new THREE.Matrix4();
const _scratchPos = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();
const _scratchEuler = new THREE.Euler();
const _scratchScale = new THREE.Vector3();
const _scratchColor = new THREE.Color();
const _scratchParticleOut: ParticleTransformOut = {
  x: 0,
  y: 0,
  z: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  scaleX: 0,
  scaleY: 0,
  scaleZ: 0,
  heat: 0,
  visible: false,
};

const _colorWhiteHot = new THREE.Color('#fff7ed');
const _colorMoltenOrange = new THREE.Color('#f97316');
const _colorDeepEmber = new THREE.Color('#991b1b');
const _colorRicochetCyan = new THREE.Color('#7dd3fc');
const _colorRicochetGold = new THREE.Color('#fef08a');

function buildLatheProfileAlongNegX(
  points: ReadonlyArray<readonly [number, number]>,
  segments = 24
): THREE.LatheGeometry {
  // LatheGeometry revolves around +Y; rotateZ(+PI/2) maps +Y -> -X so nose sits at x = 0 and tail at -L.
  const vecs = points.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y));
  const geo = new THREE.LatheGeometry(vecs, segments);
  geo.rotateZ(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

interface PenetratorMeshBundle {
  bodyGeo: THREE.BufferGeometry;
  noseCapGeo: THREE.BufferGeometry;
  accentBandGeo: THREE.BufferGeometry;
  finGeo: THREE.BufferGeometry | null;
  tracerGeo: THREE.BufferGeometry;
  machConeGeo: THREE.BufferGeometry | null;
  bodyColor: string;
  bodyMetalness: number;
  bodyRoughness: number;
  noseColor: string;
  accentColor: string;
  finCount: number;
  finOffsetX: number;
  finRadiusY: number;
  tracerOffsetX: number;
}

function buildPenetratorBundle(
  id: PenetratorId,
  lengthCm: number,
  diameterCm: number
): PenetratorMeshBundle {
  const r = diameterCm * 0.5;
  const L = lengthCm;

  if (id === '125mm_apfsds' || id === '120mm_apfsds') {
    const is125 = id === '125mm_apfsds';
    const noseLen = L * 0.14;
    const bodyGeo = buildLatheProfileAlongNegX(
      [
        [r * 0.72, noseLen],
        [r * 1.0, noseLen + L * 0.04],
        [r * 1.0, L * 0.42],
        [r * 1.18, L * 0.43],
        [r * 1.18, L * 0.56],
        [r * 1.0, L * 0.57],
        [r * 0.96, L * 0.92],
        [r * 0.76, L],
      ],
      20
    );
    const noseCapGeo = buildLatheProfileAlongNegX(
      [
        [0.02, 0],
        [r * 0.44, noseLen * 0.45],
        [r * 0.78, noseLen],
      ],
      20
    );
    const accentBandGeo = buildLatheProfileAlongNegX(
      [
        [r * 1.24, L * 0.44],
        [r * 1.24, L * 0.54],
      ],
      20
    );
    const finLen = L * 0.145;
    const finSpan = r * 2.55;
    const finThick = Math.max(0.16, r * 0.2);
    const finGeo = new THREE.BoxGeometry(finLen, finSpan, finThick);
    const tracerGeo = new THREE.CylinderGeometry(
      r * 0.56,
      r * 0.56,
      Math.max(0.8, L * 0.02),
      16
    );
    tracerGeo.rotateZ(Math.PI / 2);

    return {
      bodyGeo,
      noseCapGeo,
      accentBandGeo,
      finGeo,
      tracerGeo,
      machConeGeo: null,
      bodyColor: is125 ? '#64748b' : '#4a5a52',
      bodyMetalness: 0.92,
      bodyRoughness: 0.24,
      noseColor: is125 ? '#cbd5e1' : '#d6d3d1',
      accentColor: is125 ? '#38bdf8' : '#eab308',
      finCount: 6,
      finOffsetX: -(L * 0.91),
      finRadiusY: r * 1.45,
      tracerOffsetX: -(L + 0.3),
    };
  }

  if (id === '88mm_pzgr39' || id === '30x173_gau8') {
    const isGau8 = id === '30x173_gau8';
    const capLen = L * 0.34;
    const noseCapGeo = buildLatheProfileAlongNegX(
      [
        [0.05, 0],
        [r * 0.46, capLen * 0.36],
        [r * 0.88, capLen * 0.76],
        [r * 1.0, capLen],
      ],
      28
    );
    const bodyGeo = buildLatheProfileAlongNegX(
      [
        [r * 1.0, capLen],
        [r * 1.01, L * 0.76],
        [r * 0.98, L * 0.88],
        [r * 0.92, L * 0.97],
        [r * 0.82, L],
      ],
      28
    );
    const accentBandGeo = buildLatheProfileAlongNegX(
      [
        [r * 1.055, L * 0.78],
        [r * 1.055, L * 0.85],
        [r * 1.01, L * 0.86],
        [r * 1.055, L * 0.88],
        [r * 1.055, L * 0.93],
      ],
      28
    );
    const tracerGeo = new THREE.CylinderGeometry(
      r * 0.35,
      r * 0.35,
      1.1,
      16
    );
    tracerGeo.rotateZ(Math.PI / 2);

    return {
      bodyGeo,
      noseCapGeo,
      accentBandGeo,
      finGeo: null,
      tracerGeo,
      machConeGeo: null,
      bodyColor: isGau8 ? '#1f2937' : '#334155',
      bodyMetalness: isGau8 ? 0.88 : 0.84,
      bodyRoughness: isGau8 ? 0.28 : 0.34,
      noseColor: isGau8 ? '#cbd5e1' : '#94a3b8',
      accentColor: isGau8 ? '#dc2626' : '#d97706',
      finCount: 0,
      finOffsetX: 0,
      finRadiusY: 0,
      tracerOffsetX: -(L + 0.3),
    };
  }

  // .50 BMG M2 AP — true 1:1 scale with crisp copper jacket, black AP tip, & Mach wake cone
  const tipLen = L * 0.34;
  const noseCapGeo = buildLatheProfileAlongNegX(
    [
      [0.02, 0],
      [r * 0.5, tipLen * 0.45],
      [r * 0.86, tipLen],
    ],
    20
  );
  const bodyGeo = buildLatheProfileAlongNegX(
    [
      [r * 0.86, tipLen],
      [r * 1.0, L * 0.56],
      [r * 1.0, L * 0.86],
      [r * 0.84, L],
    ],
    20
  );
  const accentBandGeo = buildLatheProfileAlongNegX(
    [
      [r * 1.04, L * 0.68],
      [r * 1.04, L * 0.74],
    ],
    20
  );
  const tracerGeo = new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.5, 14);
  tracerGeo.rotateZ(Math.PI / 2);
  const machConeGeo = new THREE.ConeGeometry(r * 5.2, L * 2.2, 24, 1, true);
  machConeGeo.rotateZ(-Math.PI / 2);
  machConeGeo.translate(-(L * 1.15), 0, 0);

  return {
    bodyGeo,
    noseCapGeo,
    accentBandGeo,
    finGeo: null,
    tracerGeo,
    machConeGeo,
    bodyColor: '#d97742',
    bodyMetalness: 0.9,
    bodyRoughness: 0.24,
    noseColor: '#1e293b',
    accentColor: '#f59e0b',
    finCount: 0,
    finOffsetX: 0,
    finRadiusY: 0,
    tracerOffsetX: -(L + 0.15),
  };
}

interface LabBackdropProps {
  layout: ArmorTheaterLayout;
}

const LabBackdrop: React.FC<LabBackdropProps> = React.memo(({ layout }) => {
  const floorY = -Math.max(42, layout.slabHeightCm * 0.52);

  const { gridMinorGeo, gridMajorGeo, rayGuideGeo, ricochetGuideGeo } =
    useMemo(() => {
      const minorVerts: number[] = [];
      const majorVerts: number[] = [];
      const xMin = -130;
      const xMax = Math.max(150, layout.crewZoneEndXCm + 45);
      const zMin = -75;
      const zMax = 65;

      for (let x = xMin; x <= xMax; x += 10) {
        const target = x % 50 === 0 ? majorVerts : minorVerts;
        target.push(x, floorY, zMin, x, floorY, zMax);
      }
      for (let z = zMin; z <= zMax; z += 10) {
        const target = z % 50 === 0 ? majorVerts : minorVerts;
        target.push(xMin, floorY, z, xMax, floorY, z);
      }

      const gMinor = new THREE.BufferGeometry();
      gMinor.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(minorVerts, 3)
      );

      const gMajor = new THREE.BufferGeometry();
      gMajor.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(majorVerts, 3)
      );

      // Incoming horizontal ballistic trajectory guide ray
      const rayGeo = new THREE.BufferGeometry();
      rayGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [layout.approachStartXCm - 24, 0, 0.25, 0, 0, 0.25],
          3
        )
      );

      // Ricochet deflection reference ray (subtle cyan guide when outcome === 'ricochet')
      const ricGeo = new THREE.BufferGeometry();
      ricGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [
            0,
            0,
            0.25,
            layout.ricochetDirX * layout.ricochetTravelCm * 0.85,
            layout.ricochetDirY * layout.ricochetTravelCm * 0.85,
            0.25,
          ],
          3
        )
      );

      return {
        gridMinorGeo: gMinor,
        gridMajorGeo: gMajor,
        rayGuideGeo: rayGeo,
        ricochetGuideGeo: ricGeo,
      };
    }, [layout, floorY]);

  useEffect(() => {
    return () => {
      gridMinorGeo.dispose();
      gridMajorGeo.dispose();
      rayGuideGeo.dispose();
      ricochetGuideGeo.dispose();
    };
  }, [gridMinorGeo, gridMajorGeo, rayGuideGeo, ricochetGuideGeo]);

  return (
    <group>
      {/* Armored Ballistics Test Bay Floor */}
      <mesh
        position={[layout.recommendedTargetXCm, floorY - 0.6, -5]}
        receiveShadow
      >
        <boxGeometry args={[420, 1.2, 180]} />
        <meshStandardMaterial
          color="#070c17"
          metalness={0.55}
          roughness={0.72}
        />
      </mesh>

      {/* 100mm / 500mm Metric Calibration Grid */}
      <lineSegments geometry={gridMinorGeo}>
        <lineBasicMaterial color="#1e293b" transparent opacity={0.48} />
      </lineSegments>
      <lineSegments geometry={gridMajorGeo}>
        <lineBasicMaterial color="#0284c7" transparent opacity={0.34} />
      </lineSegments>

      {/* Incoming Line-of-Fire Axis Hairline */}
      <lineSegments geometry={rayGuideGeo}>
        <lineBasicMaterial color="#38bdf8" transparent opacity={0.35} />
      </lineSegments>

      {layout.outcome === 'ricochet' && (
        <lineSegments geometry={ricochetGuideGeo}>
          <lineBasicMaterial color="#22d3ee" transparent opacity={0.32} />
        </lineSegments>
      )}
    </group>
  );
});

LabBackdrop.displayName = 'LabBackdrop';

interface ArmorLayerMeshProps {
  layer: ArmorLayerLayout;
  slabHeightCm: number;
  slabDepthCm: number;
  slabLocalCenterYCm: number;
  isBackingPlate: boolean;
  eraFrontRef: React.RefObject<THREE.Group>;
  eraRearRef: React.RefObject<THREE.Group>;
  eraExplosiveMatRef: React.RefObject<THREE.MeshStandardMaterial>;
  backingGlowMatRef: React.RefObject<THREE.MeshBasicMaterial>;
  exitLocalYCm: number;
  outcome: ArmorTheaterLayout['outcome'];
}

const ArmorLayerMesh: React.FC<ArmorLayerMeshProps> = React.memo(
  ({
    layer,
    slabHeightCm,
    slabDepthCm,
    slabLocalCenterYCm,
    isBackingPlate,
    eraFrontRef,
    eraRearRef,
    eraExplosiveMatRef,
    backingGlowMatRef,
    exitLocalYCm,
    outcome,
  }) => {
    const centerX = layer.localStartCm + layer.localThicknessCm * 0.5;
    const zCenter = -slabDepthCm * 0.5;
    const t = layer.localThicknessCm;

    // Build reusable edge geometry for clean crisp CAD/museum cross-section bevel reading
    const edgesGeo = useMemo(() => {
      const box = new THREE.BoxGeometry(t, slabHeightCm, slabDepthCm);
      const edges = new THREE.EdgesGeometry(box, 20);
      box.dispose();
      return edges;
    }, [t, slabHeightCm, slabDepthCm]);

    useEffect(() => {
      return () => {
        edgesGeo.dispose();
      };
    }, [edgesGeo]);

    if (layer.kind === 'era') {
      // FY-4 / ARAT-II Explosive Reactive Armor Module:
      // Active central reactive tile (splits into front steel flyer + energetic charge + rear steel flyer)
      // flanked above & below by intact modular ERA wedge bricks.
      const tileH = 26;
      const topLimit = slabLocalCenterYCm + slabHeightCm * 0.5;
      const botLimit = slabLocalCenterYCm - slabHeightCm * 0.5;
      const upperH = Math.max(4, topLimit - tileH * 0.5);
      const lowerH = Math.max(4, -tileH * 0.5 - botLimit);
      const upperCenterY = tileH * 0.5 + upperH * 0.5;
      const lowerCenterY = -tileH * 0.5 - lowerH * 0.5;

      const frontPlateT = Math.max(0.7, t * 0.24);
      const rearPlateT = Math.max(0.7, t * 0.24);
      const explosiveT = Math.max(0.9, t - frontPlateT - rearPlateT);

      const frontX = layer.localStartCm + frontPlateT * 0.5;
      const expX = layer.localStartCm + frontPlateT + explosiveT * 0.5;
      const rearX =
        layer.localStartCm + frontPlateT + explosiveT + rearPlateT * 0.5;

      return (
        <group>
          {/* Upper Intact ERA Bricks */}
          <mesh
            position={[centerX, upperCenterY, zCenter]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[t * 0.96, upperH - 0.8, slabDepthCm]} />
            <meshStandardMaterial
              color="#4d5948"
              metalness={0.72}
              roughness={0.44}
            />
          </mesh>
          {/* Upper ERA Cutaway Hazard Strip */}
          <mesh position={[expX, upperCenterY, -0.1]}>
            <boxGeometry args={[explosiveT * 0.78, upperH - 1.4, 0.35]} />
            <meshStandardMaterial
              color="#eab308"
              emissive="#ca8a04"
              emissiveIntensity={0.22}
              metalness={0.18}
              roughness={0.55}
            />
          </mesh>

          {/* Lower Intact ERA Bricks */}
          <mesh
            position={[centerX, lowerCenterY, zCenter]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[t * 0.96, lowerH - 0.8, slabDepthCm]} />
            <meshStandardMaterial
              color="#4d5948"
              metalness={0.72}
              roughness={0.44}
            />
          </mesh>
          <mesh position={[expX, lowerCenterY, -0.1]}>
            <boxGeometry args={[explosiveT * 0.78, lowerH - 1.4, 0.35]} />
            <meshStandardMaterial
              color="#eab308"
              emissive="#ca8a04"
              emissiveIntensity={0.22}
              metalness={0.18}
              roughness={0.55}
            />
          </mesh>

          {/* Active Detonating Central ERA Energetic Explosive Core */}
          <mesh position={[expX, 0, zCenter]}>
            <boxGeometry args={[explosiveT * 0.92, tileH - 1.2, slabDepthCm * 0.94]} />
            <meshStandardMaterial
              ref={eraExplosiveMatRef}
              color="#f59e0b"
              emissive="#ff6b00"
              emissiveIntensity={0.35}
              metalness={0.1}
              roughness={0.55}
            />
          </mesh>

          {/* Active Front Flyer Steel Plate (Animated outward in useFrame) */}
          <group ref={eraFrontRef} position={[frontX, 0, zCenter]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[frontPlateT, tileH - 0.8, slabDepthCm]} />
              <meshStandardMaterial
                color="#64748b"
                metalness={0.86}
                roughness={0.34}
              />
            </mesh>
            {/* Bright cut-edge steel bevel strip facing viewer */}
            <mesh position={[0, 0, slabDepthCm * 0.5 + 0.08]}>
              <boxGeometry args={[frontPlateT * 0.92, tileH - 1.0, 0.22]} />
              <meshStandardMaterial
                color="#fbbf24"
                metalness={0.75}
                roughness={0.3}
              />
            </mesh>
          </group>

          {/* Active Rear Flyer Steel Plate (Animated shearing inward in useFrame) */}
          <group ref={eraRearRef} position={[rearX, 0, zCenter]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[rearPlateT, tileH - 0.8, slabDepthCm]} />
              <meshStandardMaterial
                color="#475569"
                metalness={0.85}
                roughness={0.38}
              />
            </mesh>
            <mesh position={[0, 0, slabDepthCm * 0.5 + 0.08]}>
              <boxGeometry args={[rearPlateT * 0.92, tileH - 1.0, 0.22]} />
              <meshStandardMaterial
                color="#f59e0b"
                metalness={0.7}
                roughness={0.35}
              />
            </mesh>
          </group>
        </group>
      );
    }

    if (layer.kind === 'ceramic_nera') {
      // Multi-layer NERA / Ceramic Composite Cavity with internal angled sandwich laminae
      const laminaCount = Math.max(3, Math.min(7, Math.round(t / 5.2)));
      const laminaStep = t / (laminaCount + 1);
      const laminaIndices: number[] = [];
      for (let i = 0; i < laminaCount; i++) laminaIndices.push(i);

      return (
        <group>
          {/* Outer containment casing */}
          <mesh
            position={[centerX, slabLocalCenterYCm, zCenter]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[t * 0.99, slabHeightCm, slabDepthCm]} />
            <meshStandardMaterial
              color="#0c243b"
              metalness={0.42}
              roughness={0.56}
            />
          </mesh>

          {/* Visible NERA Ceramic / Elastomer Sandwich Plates on Cutaway Face */}
          {laminaIndices.map((idx) => {
            const lx = layer.localStartCm + laminaStep * (idx + 1);
            const isCeramic = idx % 2 === 0;
            return (
              <mesh
                key={idx}
                position={[lx, slabLocalCenterYCm, zCenter + 0.25]}
              >
                <boxGeometry
                  args={[
                    Math.max(0.85, laminaStep * 0.52),
                    slabHeightCm * 0.94,
                    slabDepthCm * 0.98,
                  ]}
                />
                <meshStandardMaterial
                  color={isCeramic ? layer.colorHex : '#1e293b'}
                  metalness={isCeramic ? 0.26 : 0.62}
                  roughness={isCeramic ? 0.42 : 0.66}
                  emissive={isCeramic ? '#0369a1' : '#000000'}
                  emissiveIntensity={isCeramic ? 0.16 : 0}
                />
              </mesh>
            );
          })}

          <lineSegments
            position={[centerX, slabLocalCenterYCm, zCenter]}
            geometry={edgesGeo}
          >
            <lineBasicMaterial color="#38bdf8" transparent opacity={0.42} />
          </lineSegments>
        </group>
      );
    }

    if (layer.kind === 'du_composite') {
      // Heavy Depleted-Uranium (NGAP) Encapsulated Grid Array
      const barCount = Math.max(3, Math.min(6, Math.round(t / 6.5)));
      const barStep = t / (barCount + 1);
      const barIndices: number[] = [];
      for (let i = 0; i < barCount; i++) barIndices.push(i);

      return (
        <group>
          <mesh
            position={[centerX, slabLocalCenterYCm, zCenter]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[t * 0.99, slabHeightCm, slabDepthCm]} />
            <meshStandardMaterial
              color="#122b25"
              metalness={0.68}
              roughness={0.45}
            />
          </mesh>

          {barIndices.map((idx) => {
            const lx = layer.localStartCm + barStep * (idx + 1);
            return (
              <mesh
                key={idx}
                position={[lx, slabLocalCenterYCm, zCenter + 0.25]}
              >
                <boxGeometry
                  args={[
                    Math.max(1.2, barStep * 0.58),
                    slabHeightCm * 0.93,
                    slabDepthCm * 0.98,
                  ]}
                />
                <meshStandardMaterial
                  color="#10b981"
                  metalness={0.84}
                  roughness={0.34}
                  emissive="#047857"
                  emissiveIntensity={0.18}
                />
              </mesh>
            );
          })}

          <lineSegments
            position={[centerX, slabLocalCenterYCm, zCenter]}
            geometry={edgesGeo}
          >
            <lineBasicMaterial color="#34d399" transparent opacity={0.42} />
          </lineSegments>
        </group>
      );
    }

    // Rolled Homogeneous Armor (RHA / High-Hardness Steel)
    return (
      <group>
        <mesh
          position={[centerX, slabLocalCenterYCm, zCenter]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[t * 0.99, slabHeightCm, slabDepthCm]} />
          <meshStandardMaterial
            color={layer.colorHex}
            metalness={0.84}
            roughness={0.36}
          />
        </mesh>

        {/* Precision cutaway metallic edge wireframe */}
        <lineSegments
          position={[centerX, slabLocalCenterYCm, zCenter]}
          geometry={edgesGeo}
        >
          <lineBasicMaterial color="#94a3b8" transparent opacity={0.38} />
        </lineSegments>

        {/* Rear Backing Plate Status Indicator Ring at exit projection */}
        {isBackingPlate && (
          <mesh
            position={[layer.localEndCm + 0.25, exitLocalYCm, 0.2]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <ringGeometry args={[2.2, 4.6, 32]} />
            <meshBasicMaterial
              ref={backingGlowMatRef}
              color={outcome === 'perforation' ? '#ef4444' : '#10b981'}
              transparent
              opacity={0}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
    );
  }
);

ArmorLayerMesh.displayName = 'ArmorLayerMesh';

interface TheaterInnerSceneProps {
  layout: ArmorTheaterLayout;
  clock: ArmorTheaterClock;
  onHudTick: (frame: ArmorTheaterFrameState) => void;
  cameraResetTrigger: number;
}

const TheaterInnerScene: React.FC<TheaterInnerSceneProps> = ({
  layout,
  clock,
  onHudTick,
  cameraResetTrigger,
}) => {
  const { camera } = useThree();
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);

  // Pre-allocated mutable frame state (Zero-GC in useFrame!)
  const frameRef = useRef<ArmorTheaterFrameState>(
    createArmorTheaterFrameState()
  );

  // Animated 3D node refs
  const penetratorGroupRef = useRef<THREE.Group>(null);
  const penetratorBodyScaleRef = useRef<THREE.Group>(null);
  const erodingTipRef = useRef<THREE.Mesh>(null);
  const erodingTipMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const machConeMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const eraFrontRef = useRef<THREE.Group>(null);
  const eraRearRef = useRef<THREE.Group>(null);
  const eraExplosiveMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const eraBlastSphereRef = useRef<THREE.Mesh>(null);
  const eraBlastMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const backingGlowMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const cavityGroupRef = useRef<THREE.Group>(null);
  const cavityCoreRef = useRef<THREE.Mesh>(null);
  const cavityCoreMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const cavityOuterRef = useRef<THREE.Mesh>(null);
  const cavityOuterMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const impactFlashRef = useRef<THREE.Mesh>(null);
  const impactFlashMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  const shockwaveMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const arrestShockRef = useRef<THREE.Mesh>(null);
  const arrestShockMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const spallConeRef = useRef<THREE.Mesh>(null);
  const spallConeMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const spallInstancedRef = useRef<THREE.InstancedMesh>(null);
  const sparkInstancedRef = useRef<THREE.InstancedMesh>(null);

  const crewZoneBorderMatRef = useRef<THREE.LineBasicMaterial>(null);
  const crewZoneFillMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const impactLightRef = useRef<THREE.PointLight>(null);
  const cavityLightRef = useRef<THREE.PointLight>(null);

  // Build & dispose penetrator 1:1 procedural geometries
  const penetratorBundle = useMemo(
    () =>
      buildPenetratorBundle(
        layout.result.projectile.id,
        layout.penetratorLengthCm,
        layout.penetratorDiameterCm
      ),
    [
      layout.result.projectile.id,
      layout.penetratorLengthCm,
      layout.penetratorDiameterCm,
    ]
  );

  useEffect(() => {
    return () => {
      penetratorBundle.bodyGeo.dispose();
      penetratorBundle.noseCapGeo.dispose();
      penetratorBundle.accentBandGeo.dispose();
      penetratorBundle.finGeo?.dispose();
      penetratorBundle.tracerGeo.dispose();
      penetratorBundle.machConeGeo?.dispose();
    };
  }, [penetratorBundle]);

  // Build & dispose shared effect geometries cleanly on unmount
  const effectGeos = useMemo(() => {
    // Unit cylinder along +X from x = 0 (entry radius 1.0) to x = 1 (tip radius 0.82)
    const cavityCyl = new THREE.CylinderGeometry(0.82, 1.0, 1, 20, 1, false);
    cavityCyl.rotateZ(-Math.PI / 2);
    cavityCyl.translate(0.5, 0, 0);

    // Volumetric Behind-Armor Spall cone: tip at x = 0, base opening at x = +1
    const spallCone = new THREE.ConeGeometry(1, 1, 28, 1, true);
    spallCone.rotateZ(Math.PI / 2);
    spallCone.translate(0.5, 0, 0);

    const shockRing = new THREE.RingGeometry(0.82, 1.0, 40);
    const spallShard = new THREE.OctahedronGeometry(1, 0);
    const sparkStreak = new THREE.BoxGeometry(1, 1, 1);

    const crewW = Math.max(44, layout.crewZoneEndXCm - layout.crewZoneStartXCm);
    const crewH = Math.min(82, Math.max(54, layout.slabHeightCm * 0.65));
    const crewD = layout.slabDepthCm * 0.92;
    const crewBox = new THREE.BoxGeometry(crewW, crewH, crewD);
    const crewEdges = new THREE.EdgesGeometry(crewBox);
    crewBox.dispose();

    return {
      cavityCyl,
      spallCone,
      shockRing,
      spallShard,
      sparkStreak,
      crewEdges,
      crewW,
      crewH,
      crewD,
    };
  }, [layout.crewZoneStartXCm, layout.crewZoneEndXCm, layout.slabHeightCm, layout.slabDepthCm]);

  useEffect(() => {
    return () => {
      effectGeos.cavityCyl.dispose();
      effectGeos.spallCone.dispose();
      effectGeos.shockRing.dispose();
      effectGeos.spallShard.dispose();
      effectGeos.sparkStreak.dispose();
      effectGeos.crewEdges.dispose();
    };
  }, [effectGeos]);

  // Pre-seed InstancedMesh instanceColor buffers before first render so Three.js compiles USE_INSTANCING_COLOR cleanly
  useEffect(() => {
    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
    const white = new THREE.Color('#ffffff');
    const spallMesh = spallInstancedRef.current;
    if (spallMesh) {
      for (let i = 0; i < SPALL_PARTICLE_COUNT; i++) {
        spallMesh.setMatrixAt(i, zeroMat);
        spallMesh.setColorAt(i, white);
      }
      spallMesh.instanceMatrix.needsUpdate = true;
      if (spallMesh.instanceColor) spallMesh.instanceColor.needsUpdate = true;
    }
    const sparkMesh = sparkInstancedRef.current;
    if (sparkMesh) {
      for (let i = 0; i < SPARK_PARTICLE_COUNT; i++) {
        sparkMesh.setMatrixAt(i, zeroMat);
        sparkMesh.setColorAt(i, white);
      }
      sparkMesh.instanceMatrix.needsUpdate = true;
      if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
    }
  }, [effectGeos]);

  // Precompute ERA local rest coordinates so useFrame mutates without allocations
  const eraRestCoords = useMemo(() => {
    if (!layout.eraActive || layout.eraLayerIndex < 0) {
      return { frontX: 0, expX: 0, rearX: 0 };
    }
    const eraLayer = layout.layers[layout.eraLayerIndex];
    const t = eraLayer.localThicknessCm;
    const frontT = Math.max(0.7, t * 0.24);
    const rearT = Math.max(0.7, t * 0.24);
    const expT = Math.max(0.9, t - frontT - rearT);
    return {
      frontX: eraLayer.localStartCm + frontT * 0.5,
      expX: eraLayer.localStartCm + frontT + expT * 0.5,
      rearX: eraLayer.localStartCm + frontT + expT + rearT * 0.5,
    };
  }, [layout]);

  // Local Y coordinate where horizontal exit ray intersects rear backing plate
  const exitLocalYCm = useMemo(() => {
    return layout.totalLosCm * Math.sin(layout.visualTiltRad);
  }, [layout.totalLosCm, layout.visualTiltRad]);

  // Frame camera smoothly on target change or explicit camera reset button
  const cameraFrameKey = `${layout.result.target.id}-${layout.result.zone.id}-${cameraResetTrigger}`;
  useEffect(() => {
    const dist = layout.recommendedCameraDistanceCm;
    const tx = layout.recommendedTargetXCm;
    const ty = layout.recommendedTargetYCm;
    // Hero 3/4 cutaway theater vantage: slightly above & in front of z = 0 cutaway plane
    camera.position.set(tx - dist * 0.16, ty + dist * 0.24, dist * 0.96);
    if (controlsRef.current) {
      controlsRef.current.target.set(tx, ty, -4);
      controlsRef.current.update();
    } else {
      camera.lookAt(tx, ty, -4);
    }
  }, [
    camera,
    cameraFrameKey,
    layout.recommendedCameraDistanceCm,
    layout.recommendedTargetXCm,
    layout.recommendedTargetYCm,
  ]);

  // 60fps Zero-GC Simulation Loop (NO setState, NO object allocations!)
  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const currentProgress = clock.step(dt);

    const frame = evaluateArmorTheaterFrameInto(
      layout,
      currentProgress,
      frameRef.current
    );

    // 1. Update penetrator transform, hydrodynamic rod erosion, & incandescent tip
    if (penetratorGroupRef.current) {
      penetratorGroupRef.current.position.set(
        frame.rodNoseX,
        frame.rodNoseY,
        0.45
      );
      penetratorGroupRef.current.rotation.set(0, 0, frame.rodPitchRad);
    }
    if (penetratorBodyScaleRef.current) {
      penetratorBodyScaleRef.current.scale.set(
        Math.max(0.15, frame.rodLengthFraction),
        1,
        1
      );
    }
    if (erodingTipRef.current && erodingTipMatRef.current) {
      const tipActive = frame.progress >= THEATER_T_IMPACT;
      erodingTipRef.current.visible = tipActive && frame.rodGlowIntensity > 0.05;
      const baseGlowRadius = Math.min(2.6, layout.penetratorDiameterCm * 0.48);
      const tipScale =
        baseGlowRadius * (0.72 + 0.38 * frame.rodGlowIntensity);
      erodingTipRef.current.scale.set(tipScale * 1.15, tipScale, tipScale);
      const maxOpacity = layout.outcome === 'ricochet' ? 0.42 : 0.88;
      erodingTipMatRef.current.opacity = Math.min(
        maxOpacity,
        frame.rodGlowIntensity * maxOpacity
      );
      _scratchColor.lerpColors(
        _colorMoltenOrange,
        _colorWhiteHot,
        Math.min(1, frame.rodGlowIntensity)
      );
      erodingTipMatRef.current.color.copy(_scratchColor);
    }
    if (machConeMatRef.current) {
      machConeMatRef.current.opacity =
        frame.progress < THEATER_T_IMPACT ? 0.28 : 0;
    }

    // 2. Update ERA twin flyer plates & explosive flash cavity
    if (layout.eraActive) {
      if (eraFrontRef.current) {
        eraFrontRef.current.position.set(
          eraRestCoords.frontX - frame.eraFrontFlyerNormalCm,
          frame.eraFrontFlyerShearCm,
          -layout.slabDepthCm * 0.5
        );
        eraFrontRef.current.rotation.set(0, 0, frame.eraFrontFlyerTiltRad);
      }
      if (eraRearRef.current) {
        eraRearRef.current.position.set(
          eraRestCoords.rearX + frame.eraRearFlyerNormalCm,
          frame.eraRearFlyerShearCm,
          -layout.slabDepthCm * 0.5
        );
        eraRearRef.current.rotation.set(0, 0, frame.eraRearFlyerTiltRad);
      }
      if (eraExplosiveMatRef.current) {
        eraExplosiveMatRef.current.emissiveIntensity =
          0.35 + frame.eraFlashIntensity * 4.2;
      }
      if (eraBlastSphereRef.current && eraBlastMatRef.current) {
        const showBlast = frame.eraFlashIntensity > 0.02;
        eraBlastSphereRef.current.visible = showBlast;
        if (showBlast) {
          const rad = 2.5 + (1 - frame.eraFlashIntensity * 0.55) * 18;
          eraBlastSphereRef.current.scale.set(rad * 0.65, rad * 1.2, rad * 0.9);
          eraBlastMatRef.current.opacity = frame.eraFlashIntensity * 0.85;
        }
      }
    }

    // 3. Update molten hydrodynamic penetration channel (or shallow ricochet surface gouge)
    if (
      cavityGroupRef.current &&
      cavityCoreRef.current &&
      cavityOuterRef.current &&
      cavityCoreMatRef.current &&
      cavityOuterMatRef.current
    ) {
      const hasCavity = frame.cavityDepthLosCm > 0.15;
      cavityGroupRef.current.visible = hasCavity;
      if (hasCavity) {
        const cavAngle =
          layout.outcome === 'ricochet'
            ? Math.atan2(layout.slopeTangentY, layout.slopeTangentX)
            : 0;
        cavityGroupRef.current.rotation.set(0, 0, cavAngle);

        const len = frame.cavityDepthLosCm;
        const r = frame.cavityRadiusCm;
        cavityCoreRef.current.scale.set(len, r * 0.72, r * 0.72);
        cavityOuterRef.current.scale.set(len * 1.02, r * 1.32, r * 1.32);

        cavityCoreMatRef.current.opacity = Math.min(
          0.95,
          0.2 + frame.cavityGlowIntensity * 0.78
        );
        cavityOuterMatRef.current.opacity = Math.min(
          0.62,
          0.14 + frame.cavityGlowIntensity * 0.48
        );

        _scratchColor.lerpColors(
          _colorMoltenOrange,
          _colorWhiteHot,
          Math.min(1, frame.cavityGlowIntensity * 0.92)
        );
        cavityCoreMatRef.current.color.copy(_scratchColor);
      }
    }

    // 4. Update impact flash, surface shockwave ring, and defeated internal arrest ring
    if (impactFlashRef.current && impactFlashMatRef.current) {
      const vis = frame.impactFlashIntensity > 0.015;
      impactFlashRef.current.visible = vis;
      if (vis) {
        const s = 2.8 + frame.impactFlashIntensity * 14;
        impactFlashRef.current.scale.setScalar(s);
        impactFlashMatRef.current.opacity = frame.impactFlashIntensity * 0.92;
      }
    }

    if (shockwaveRef.current && shockwaveMatRef.current) {
      const vis = frame.shockwaveOpacity > 0.015;
      shockwaveRef.current.visible = vis;
      if (vis) {
        shockwaveRef.current.scale.setScalar(frame.shockwaveRadiusCm);
        shockwaveMatRef.current.opacity = frame.shockwaveOpacity;
      }
    }

    if (arrestShockRef.current && arrestShockMatRef.current) {
      const vis = frame.arrestShockOpacity > 0.015;
      arrestShockRef.current.visible = vis;
      if (vis) {
        arrestShockRef.current.position.set(layout.maxCavityDepthLosCm, 0, 0.7);
        arrestShockRef.current.scale.setScalar(frame.arrestShockRadiusCm);
        arrestShockMatRef.current.opacity = frame.arrestShockOpacity;
      }
    }

    // 5. Rear backing plate breach / integrity indicator
    if (backingGlowMatRef.current) {
      if (
        layout.outcome === 'perforation' &&
        frame.progress >= THEATER_T_PERFORATION_EXIT
      ) {
        backingGlowMatRef.current.opacity = 0.85 * frame.spallGlowIntensity;
      } else if (
        layout.outcome === 'partial_penetration' &&
        frame.phase === 'defeated_arrest'
      ) {
        backingGlowMatRef.current.opacity = 0.55;
      } else {
        backingGlowMatRef.current.opacity = 0;
      }
    }

    // 6. Behind-Armor Spall (BAP) volumetric cone + 56 instanced incandescent shards
    if (spallConeRef.current && spallConeMatRef.current) {
      spallConeRef.current.visible = frame.spallActive;
      if (frame.spallActive) {
        spallConeRef.current.position.set(layout.exitXCm, 0, 0.25);
        spallConeRef.current.scale.set(
          frame.spallConeLengthCm,
          frame.spallConeRadiusCm,
          frame.spallConeRadiusCm
        );
        spallConeMatRef.current.opacity = frame.spallGlowIntensity * 0.24;
      }
    }

    if (spallInstancedRef.current) {
      const mesh = spallInstancedRef.current;
      mesh.visible = frame.spallActive;
      if (frame.spallActive) {
        for (let i = 0; i < SPALL_PARTICLE_COUNT; i++) {
          evaluateSpallParticleInto(layout, frame, i, _scratchParticleOut);
          if (_scratchParticleOut.visible) {
            _scratchPos.set(
              _scratchParticleOut.x,
              _scratchParticleOut.y,
              _scratchParticleOut.z
            );
            _scratchEuler.set(
              _scratchParticleOut.rotX,
              _scratchParticleOut.rotY,
              _scratchParticleOut.rotZ
            );
            _scratchQuat.setFromEuler(_scratchEuler);
            _scratchScale.set(
              _scratchParticleOut.scaleX,
              _scratchParticleOut.scaleY,
              _scratchParticleOut.scaleZ
            );
            _scratchMatrix.compose(_scratchPos, _scratchQuat, _scratchScale);
            mesh.setMatrixAt(i, _scratchMatrix);

            if (_scratchParticleOut.heat > 0.55) {
              _scratchColor.lerpColors(
                _colorMoltenOrange,
                _colorWhiteHot,
                (_scratchParticleOut.heat - 0.55) / 0.45
              );
            } else {
              _scratchColor.lerpColors(
                _colorDeepEmber,
                _colorMoltenOrange,
                _scratchParticleOut.heat / 0.55
              );
            }
            mesh.setColorAt(i, _scratchColor);
          } else {
            _scratchScale.set(0, 0, 0);
            _scratchMatrix.makeScale(0, 0, 0);
            mesh.setMatrixAt(i, _scratchMatrix);
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }

    // 7. Ricochet grazing spark spray & crater splashback sparks
    if (sparkInstancedRef.current) {
      const mesh = sparkInstancedRef.current;
      mesh.visible = frame.sparkActive;
      if (frame.sparkActive) {
        const isRicochet = layout.outcome === 'ricochet';
        for (let i = 0; i < SPARK_PARTICLE_COUNT; i++) {
          evaluateSparkParticleInto(layout, frame, i, _scratchParticleOut);
          if (_scratchParticleOut.visible) {
            _scratchPos.set(
              _scratchParticleOut.x,
              _scratchParticleOut.y,
              _scratchParticleOut.z
            );
            _scratchEuler.set(
              _scratchParticleOut.rotX,
              _scratchParticleOut.rotY,
              _scratchParticleOut.rotZ
            );
            _scratchQuat.setFromEuler(_scratchEuler);
            _scratchScale.set(
              _scratchParticleOut.scaleX,
              _scratchParticleOut.scaleY,
              _scratchParticleOut.scaleZ
            );
            _scratchMatrix.compose(_scratchPos, _scratchQuat, _scratchScale);
            mesh.setMatrixAt(i, _scratchMatrix);

            if (isRicochet) {
              _scratchColor.lerpColors(
                _colorRicochetCyan,
                _colorRicochetGold,
                _scratchParticleOut.heat
              );
            } else {
              _scratchColor.lerpColors(
                _colorMoltenOrange,
                _colorWhiteHot,
                _scratchParticleOut.heat
              );
            }
            mesh.setColorAt(i, _scratchColor);
          } else {
            _scratchMatrix.makeScale(0, 0, 0);
            mesh.setMatrixAt(i, _scratchMatrix);
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }

    // 8. Crew Compartment warning border highlight when perforated
    if (crewZoneBorderMatRef.current && crewZoneFillMatRef.current) {
      const alert = frame.crewAlertIntensity;
      if (alert > 0.02) {
        crewZoneBorderMatRef.current.color.set('#f87171');
        crewZoneBorderMatRef.current.opacity = 0.35 + alert * 0.55;
        crewZoneFillMatRef.current.opacity = 0.04 + alert * 0.1;
      } else {
        crewZoneBorderMatRef.current.color.set('#334155');
        crewZoneBorderMatRef.current.opacity = 0.28;
        crewZoneFillMatRef.current.opacity = 0.025;
      }
    }

    // 9. Dynamic physically-coupled flash & molten glow point lights
    if (impactLightRef.current) {
      impactLightRef.current.intensity =
        frame.impactFlashIntensity * 120 + frame.eraFlashIntensity * 150;
    }
    if (cavityLightRef.current) {
      cavityLightRef.current.position.set(frame.rodNoseX, frame.rodNoseY, 8);
      cavityLightRef.current.intensity =
        frame.cavityGlowIntensity * 45 + frame.spallGlowIntensity * 65;
    }

    // 10. Push direct DOM telemetry updates (Zero React re-renders!)
    onHudTick(frame);
  });

  const crewCenterX =
    (layout.crewZoneStartXCm + layout.crewZoneEndXCm) * 0.5;
  const finAngles = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < penetratorBundle.finCount; i++) {
      arr.push((i / penetratorBundle.finCount) * Math.PI * 2);
    }
    return arr;
  }, [penetratorBundle.finCount]);

  return (
    <>
      <color attach="background" args={['#060b16']} />
      <fog attach="fog" args={['#060b16', 240, 560]} />

      {/* Dark Armored Lab 3-Point Studio Lighting */}
      <hemisphereLight args={['#7dd3fc', '#0f172a', 0.65]} />
      <directionalLight
        position={[-65, 110, 95]}
        intensity={2.1}
        color="#e0f2fe"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight
        position={[95, 55, -60]}
        intensity={1.05}
        color="#fb923c"
      />
      <directionalLight
        position={[15, -40, 80]}
        intensity={0.45}
        color="#38bdf8"
      />

      {/* Dynamic Impact / ERA Detonation & Molten Cavity Point Lights */}
      <pointLight
        ref={impactLightRef}
        position={[-4, 4, 14]}
        color="#ffb347"
        intensity={0}
        distance={140}
        decay={1.5}
      />
      <pointLight
        ref={cavityLightRef}
        position={[0, 0, 8]}
        color="#ff6b00"
        intensity={0}
        distance={95}
        decay={1.6}
      />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={48}
        maxDistance={360}
        maxPolarAngle={Math.PI * 0.62}
      />

      <LabBackdrop layout={layout} />

      {/* 1:1 Dynamically Tilted Composite Armor Cutaway Cross-Section Block */}
      <group rotation={[0, 0, -layout.visualTiltRad]}>
        {layout.layers.map((layer) => (
          <ArmorLayerMesh
            key={`${layer.nameEn}-${layer.index}`}
            layer={layer}
            slabHeightCm={layout.slabHeightCm}
            slabDepthCm={layout.slabDepthCm}
            slabLocalCenterYCm={layout.slabLocalCenterYCm}
            isBackingPlate={layer.index === layout.layers.length - 1}
            eraFrontRef={eraFrontRef}
            eraRearRef={eraRearRef}
            eraExplosiveMatRef={eraExplosiveMatRef}
            backingGlowMatRef={backingGlowMatRef}
            exitLocalYCm={exitLocalYCm}
            outcome={layout.outcome}
          />
        ))}

        {/* ERA Detonation Core Flash (local to tilted ERA cavity) */}
        {layout.eraActive && (
          <mesh
            ref={eraBlastSphereRef}
            position={[eraRestCoords.expX, 0, 0.8]}
            visible={false}
          >
            <sphereGeometry args={[1, 20, 16]} />
            <meshBasicMaterial
              ref={eraBlastMatRef}
              color="#fff3c4"
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        )}

        {/* Impact Surface Shockwave Ring aligned flush to tilted front face */}
        <mesh
          ref={shockwaveRef}
          position={[-0.35, 0, 0.5]}
          rotation={[0, Math.PI / 2, 0]}
          geometry={effectGeos.shockRing}
          visible={false}
        >
          <meshBasicMaterial
            ref={shockwaveMatRef}
            color={layout.outcome === 'ricochet' ? '#38bdf8' : '#fb923c'}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Glowing Molten Hydrodynamic Penetration Channel / Grazing Gouge */}
      <group ref={cavityGroupRef} position={[0, 0, 0.45]} visible={false}>
        <mesh ref={cavityOuterRef} geometry={effectGeos.cavityCyl}>
          <meshBasicMaterial
            ref={cavityOuterMatRef}
            color="#ea580c"
            transparent
            opacity={0.45}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh ref={cavityCoreRef} geometry={effectGeos.cavityCyl}>
          <meshBasicMaterial
            ref={cavityCoreMatRef}
            color="#fff7ed"
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Primary Contact Flash Burst */}
      <mesh ref={impactFlashRef} position={[0, 0, 1.2]} visible={false}>
        <sphereGeometry args={[1, 18, 14]} />
        <meshBasicMaterial
          ref={impactFlashMatRef}
          color="#fffbeb"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Localized Internal Arrest Shockwave Ring (DEFEATED outcome) */}
      <mesh
        ref={arrestShockRef}
        position={[layout.maxCavityDepthLosCm, 0, 0.7]}
        geometry={effectGeos.shockRing}
        visible={false}
      >
        <meshBasicMaterial
          ref={arrestShockMatRef}
          color="#34d399"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 1:1 Selected Kinetic Penetrator Assembly (Nose at local x = 0) */}
      <group ref={penetratorGroupRef} position={[layout.approachStartXCm, 0, 0.45]}>
        <group ref={penetratorBodyScaleRef}>
          <mesh geometry={penetratorBundle.bodyGeo} castShadow>
            <meshStandardMaterial
              color={penetratorBundle.bodyColor}
              metalness={penetratorBundle.bodyMetalness}
              roughness={penetratorBundle.bodyRoughness}
            />
          </mesh>
          <mesh geometry={penetratorBundle.noseCapGeo} castShadow>
            <meshStandardMaterial
              color={penetratorBundle.noseColor}
              metalness={0.82}
              roughness={0.28}
            />
          </mesh>
          <mesh geometry={penetratorBundle.accentBandGeo}>
            <meshStandardMaterial
              color={penetratorBundle.accentColor}
              metalness={0.88}
              roughness={0.24}
            />
          </mesh>

          {/* Tail Stabilizer Fins (APFSDS Sabot Rod) */}
          {penetratorBundle.finGeo !== null &&
            finAngles.map((ang, idx) => {
              const finGeo = penetratorBundle.finGeo;
              if (!finGeo) return null;
              return (
                <mesh
                  key={idx}
                  geometry={finGeo}
                  position={[
                    penetratorBundle.finOffsetX,
                    Math.cos(ang) * penetratorBundle.finRadiusY * 0.5,
                    Math.sin(ang) * penetratorBundle.finRadiusY * 0.5,
                  ]}
                  rotation={[ang, 0, 0]}
                >
                  <meshStandardMaterial
                    color="#cbd5e1"
                    metalness={0.9}
                    roughness={0.26}
                  />
                </mesh>
              );
            })}

          {/* Glowing Base Tracer */}
          <mesh
            geometry={penetratorBundle.tracerGeo}
            position={[penetratorBundle.tracerOffsetX, 0, 0]}
          >
            <meshBasicMaterial color="#fb923c" />
          </mesh>
        </group>

        {/* Supersonic Mach Wake Cone (keeps 1:1 .50 BMG vivid against MBT slabs) */}
        {penetratorBundle.machConeGeo && (
          <mesh geometry={penetratorBundle.machConeGeo}>
            <meshBasicMaterial
              ref={machConeMatRef}
              color="#7dd3fc"
              transparent
              opacity={0.28}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        )}

        {/* Incandescent Eroding Mushroom Nose Glow */}
        <mesh ref={erodingTipRef} position={[0, 0, 0]} visible={false}>
          <sphereGeometry args={[1, 14, 12]} />
          <meshBasicMaterial
            ref={erodingTipMatRef}
            color="#fff7ed"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Behind-Armor Spall (BAP) Volumetric Cone Envelope (PERFORATION) */}
      <mesh
        ref={spallConeRef}
        geometry={effectGeos.spallCone}
        visible={false}
      >
        <meshBasicMaterial
          ref={spallConeMatRef}
          color="#fb923c"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 56 Zero-GC Instanced Incandescent Behind-Armor Spall Shards */}
      <instancedMesh
        ref={spallInstancedRef}
        args={[effectGeos.spallShard, undefined, SPALL_PARTICLE_COUNT]}
        visible={false}
        frustumCulled={false}
      >
        <meshBasicMaterial
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>

      {/* 56 Zero-GC Instanced Grazing Ricochet Sparks & Crater Ejecta */}
      <instancedMesh
        ref={sparkInstancedRef}
        args={[effectGeos.sparkStreak, undefined, SPARK_PARTICLE_COUNT]}
        visible={false}
        frustumCulled={false}
      >
        <meshBasicMaterial
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>

      {/* Protected Crew Compartment Zone Wireframe Behind Backing Plate */}
      <group position={[crewCenterX, 0, -layout.slabDepthCm * 0.48]}>
        <lineSegments geometry={effectGeos.crewEdges}>
          <lineBasicMaterial
            ref={crewZoneBorderMatRef}
            color="#334155"
            transparent
            opacity={0.28}
          />
        </lineSegments>
        <mesh>
          <boxGeometry
            args={[effectGeos.crewW, effectGeos.crewH, effectGeos.crewD]}
          />
          <meshBasicMaterial
            ref={crewZoneFillMatRef}
            color="#ef4444"
            transparent
            opacity={0.025}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  );
};

export const ArmorPenetration3DScene: React.FC<ArmorPenetration3DSceneProps> = ({
  result,
  lang,
  compact = false,
}) => {
  const ui = ARMOR_PENETRATION_STRINGS[lang];
  const layout = useMemo(() => buildArmorTheaterLayout(result), [result]);

  const [clock] = useState<ArmorTheaterClock>(() => createArmorTheaterClock());
  const isPlaying = useSyncExternalStore(
    clock.subscribePlaying,
    clock.getPlaying,
    clock.getPlaying
  );
  const isClient = useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot
  );
  const [speed, setSpeed] = useState<TheaterPlaybackSpeed>(0.5);
  const [cameraResetTrigger, setCameraResetTrigger] = useState<number>(0);
  const [contextLost, setContextLost] = useState<boolean>(false);
  const [contextEpoch, setContextEpoch] = useState<number>(0);
  const [canvasRetryKey, setCanvasRetryKey] = useState<number>(0);

  const scrubbingRef = useRef<boolean>(false);
  const canvasCleanupRef = useRef<(() => void) | null>(null);

  const handleRetryWebgl = useCallback(() => {
    playWorkbenchFoley('preset_detent');
    canvasCleanupRef.current?.();
    canvasCleanupRef.current = null;
    setContextLost(false);
    setCanvasRetryKey((k) => k + 1);
  }, []);

  // Direct DOM refs for 60fps HUD telemetry without React re-renders
  const scrubberRef = useRef<HTMLInputElement>(null);
  const progressPctRef = useRef<HTMLSpanElement>(null);
  const phaseLabelRef = useRef<HTMLSpanElement>(null);
  const velocityReadoutRef = useRef<HTMLSpanElement>(null);
  const depthReadoutRef = useRef<HTMLSpanElement>(null);

  const lastDomPhaseRef = useRef<TheaterPhase | null>(null);
  const lastDomPctRef = useRef<number>(-1);
  const lastDomVelRef = useRef<number>(-1);
  const lastDomDepthRef = useRef<number>(-1);

  // Keep latest localized phase map accessible inside Zero-GC tick callback
  const phaseStringsRef = useRef(ui.theater.phases);
  useEffect(() => {
    phaseStringsRef.current = ui.theater.phases;
    lastDomPhaseRef.current = null;
  }, [ui.theater.phases]);

  // Replay smoothly from t = 0 whenever core combat pairing changes (projectile, tank, zone, ERA)
  const replayKey = `${result.projectile.id}|${result.target.id}|${result.zone.id}|${result.eraActive ? 1 : 0}`;
  useEffect(() => {
    clock.resetAndPlay();
    lastDomPhaseRef.current = null;
    lastDomPctRef.current = -1;
    lastDomVelRef.current = -1;
    lastDomDepthRef.current = -1;
  }, [clock, replayKey]);

  useEffect(() => {
    return () => {
      canvasCleanupRef.current?.();
      canvasCleanupRef.current = null;
    };
  }, []);

  const handleHudTick = useCallback((frame: ArmorTheaterFrameState) => {
    const pct = Math.round(frame.progress * 100);
    if (!scrubbingRef.current && scrubberRef.current) {
      scrubberRef.current.value = String(Math.round(frame.progress * 1000));
    }
    if (pct !== lastDomPctRef.current && progressPctRef.current) {
      lastDomPctRef.current = pct;
      progressPctRef.current.textContent = `${pct}%`;
    }
    if (frame.phase !== lastDomPhaseRef.current && phaseLabelRef.current) {
      lastDomPhaseRef.current = frame.phase;
      phaseLabelRef.current.textContent = phaseStringsRef.current[frame.phase];
      phaseLabelRef.current.dataset.phase = frame.phase;
    }
    const velInt = Math.round(frame.currentVelocityMps);
    if (velInt !== lastDomVelRef.current && velocityReadoutRef.current) {
      lastDomVelRef.current = velInt;
      velocityReadoutRef.current.textContent = `${velInt} m/s`;
    }
    const depthMm = Math.round(frame.cavityDepthLosCm * 10);
    if (depthMm !== lastDomDepthRef.current && depthReadoutRef.current) {
      lastDomDepthRef.current = depthMm;
      depthReadoutRef.current.textContent = `${depthMm} mm`;
    }
  }, []);

  const handleTogglePlay = () => {
    playWorkbenchFoley('toggle_switch');
    clock.togglePlaying();
  };

  const handleResetReplay = () => {
    playWorkbenchFoley('preset_detent');
    clock.resetAndPlay();
  };

  const handleSelectSpeed = (nextSpeed: TheaterPlaybackSpeed) => {
    playWorkbenchFoley('toggle_switch');
    clock.setSpeed(nextSpeed);
    setSpeed(nextSpeed);
  };

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const p = Number(e.target.value) / 1000;
    clock.setProgress(p);
    clock.pause();
  };

  const outcomeToneClass =
    layout.outcome === 'perforation'
      ? 'is-perforation'
      : layout.outcome === 'ricochet'
        ? 'is-ricochet'
        : 'is-defeated';

  return (
    <div
      className={`armor-theater-card ${compact ? 'is-compact' : ''}`}
      data-testid="armor-penetration-3d-theater"
    >
      <div className="armor-theater-viewport">
        {/* Top Overlay HUD: Live Phase, Live Velocity / Depth Telemetry & Camera Reset */}
        <div className="armor-theater-overlay-top">
          <div className="armor-theater-telemetry-pills">
            <span
              ref={phaseLabelRef}
              className={`armor-theater-phase-pill ${outcomeToneClass}`}
              data-phase="approach"
            >
              {ui.theater.phases.approach}
            </span>
            <span className="armor-theater-metric-pill tabular">
              <small>{ui.theater.liveVelocity}</small>
              <strong ref={velocityReadoutRef}>
                {Math.round(result.impactVelocityMps)} m/s
              </strong>
            </span>
            <span className="armor-theater-metric-pill tabular">
              <small>{ui.theater.liveCavity}</small>
              <strong ref={depthReadoutRef}>0 mm</strong>
            </span>
            {layout.outcome === 'perforation' && (
              <span className="armor-theater-metric-pill is-spall tabular">
                <small>{ui.theater.spallConeLabel}</small>
                <strong>±{Math.round(layout.spallConeHalfAngleDeg)}°</strong>
              </span>
            )}
          </div>

          <button
            type="button"
            className="armor-theater-cam-btn"
            onClick={() => {
              playWorkbenchFoley('preset_detent');
              setCameraResetTrigger((v) => v + 1);
            }}
            title={ui.theater.resetCamera}
          >
            <Camera size={12} aria-hidden="true" />
            <span>{ui.theater.resetCamera}</span>
          </button>
        </div>

        {/* Bottom Subtle Orientation & Scale Hint */}
        <div className="armor-theater-overlay-bottom" aria-hidden="true">
          <span>
            {result.projectile.code} · {layout.visualTiltDeg.toFixed(1)}°
            {layout.eraActive ? ' · ERA' : ''}
          </span>
          <span>{ui.theater.orbitHint}</span>
        </div>

        {isClient ? (
          <ViewportErrorBoundary>
            <Canvas
              key={canvasRetryKey}
              shadows="soft"
              dpr={[1, 2]}
              gl={{
                antialias: true,
                powerPreference: 'high-performance',
                toneMapping: THREE.AgXToneMapping,
                toneMappingExposure: 1.08,
              }}
              camera={{ fov: 38, near: 0.5, far: 1200, position: [-20, 32, 148] }}
              onCreated={({ gl }) => {
                canvasCleanupRef.current?.();
                const dom = gl.domElement;
                const onLost = (ev: Event) => {
                  ev.preventDefault();
                  setContextLost(true);
                };
                const onRestored = () => {
                  setContextLost(false);
                  setContextEpoch((e) => e + 1);
                };
                dom.addEventListener('webglcontextlost', onLost, false);
                dom.addEventListener('webglcontextrestored', onRestored, false);
                canvasCleanupRef.current = () => {
                  dom.removeEventListener('webglcontextlost', onLost, false);
                  dom.removeEventListener(
                    'webglcontextrestored',
                    onRestored,
                    false
                  );
                };
              }}
              style={{ width: '100%', height: '100%' }}
            >
              <TheaterInnerScene
                key={contextEpoch}
                layout={layout}
                clock={clock}
                onHudTick={handleHudTick}
                cameraResetTrigger={cameraResetTrigger}
              />
            </Canvas>
          </ViewportErrorBoundary>
        ) : (
          <div className="armor-theater-fallback">
            <span>{ui.theater.title}</span>
          </div>
        )}

        {contextLost && (
          <div
            className="viewport-error-fallback armor-theater-fallback"
            role="alert"
            style={{ zIndex: 8 }}
          >
            <div className="viewport-error-card">
              <span className="viewport-error-badge">
                WEBGL CONTEXT RECOVERY
              </span>
              <h3 className="viewport-error-title">
                {lang === 'en'
                  ? 'Restoring 3D Armor Theater…'
                  : '正在恢复 3D 穿甲剖视剧场…'}
              </h3>
              <p className="viewport-error-desc">{ui.theater.webglFallback}</p>
              <button
                type="button"
                className="viewport-error-retry"
                onClick={handleRetryWebgl}
              >
                <RotateCcw size={14} aria-hidden="true" />
                <span>
                  {lang === 'en'
                    ? 'Reinitialize 3D Viewport'
                    : '重新初始化 3D 视口'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Slow-Motion Playback Transport Bar */}
      <div className="armor-theater-controls">
        <div className="armor-theater-transport">
          <button
            type="button"
            className="armor-theater-play-btn"
            onClick={handleTogglePlay}
            aria-label={isPlaying ? ui.theater.pause : ui.theater.play}
          >
            {isPlaying ? (
              <Pause size={13} aria-hidden="true" />
            ) : (
              <Play size={13} aria-hidden="true" />
            )}
            <span>{isPlaying ? ui.theater.pause : ui.theater.play}</span>
          </button>

          <button
            type="button"
            className="armor-theater-icon-btn"
            onClick={handleResetReplay}
            aria-label={ui.theater.reset}
            title={ui.theater.reset}
          >
            <RotateCcw size={13} aria-hidden="true" />
          </button>
        </div>

        <div className="armor-theater-scrubber-wrap">
          <input
            ref={scrubberRef}
            type="range"
            min={0}
            max={1000}
            step={1}
            defaultValue={0}
            className="armor-theater-scrubber"
            aria-label={ui.theater.timelineAria}
            onPointerDown={() => {
              scrubbingRef.current = true;
              clock.setScrubbing(true);
            }}
            onPointerUp={() => {
              scrubbingRef.current = false;
              clock.setScrubbing(false);
            }}
            onPointerCancel={() => {
              scrubbingRef.current = false;
              clock.setScrubbing(false);
            }}
            onChange={handleScrubChange}
          />
          <span
            ref={progressPctRef}
            className="armor-theater-pct tabular"
          >
            0%
          </span>
        </div>

        <div
          className="armor-theater-speed-group"
          role="group"
          aria-label={ui.theater.speedLabel}
        >
          {PLAYBACK_SPEEDS.map((spd) => (
            <button
              key={spd}
              type="button"
              className={`armor-theater-speed-btn ${
                speed === spd ? 'is-active' : ''
              }`}
              onClick={() => handleSelectSpeed(spd)}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ArmorPenetration3DScene;
