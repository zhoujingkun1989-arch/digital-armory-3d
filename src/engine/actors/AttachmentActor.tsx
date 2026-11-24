import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import { getLoadedWeaponPlugin } from '../../weapons/registry';
import {
  DEFAULT_ATTACHMENT_LOADOUT,
  type MuzzleAttachmentId,
  type OpticAttachmentId,
  getWeaponAttachmentMountProfile,
} from '../attachments/attachmentSpecs';
import { useAttachmentStore } from '../attachments/attachmentStore';
import { playbackClock } from '../clock/playbackClock';
import {
  SECTION_CUT_BOX_PLANES,
  SECTION_CUT_PLANES,
} from './StencilSectionCap';

const noRaycast = (): null => null;
const HDR_RED_DOT_COLOR = new THREE.Color(4.8, 0.45, 0.45);

// ============================================================================
// Procedural Cutaway-Ready Geometry Builders (1 unit = 1 cm · +X fwd, +Y up)
// All geometries are built once per mounted attachment and cleanly disposed.
// ============================================================================

interface SuppressorMeshes {
  outerTube: THREE.BufferGeometry;
  qdCollar: THREE.BufferGeometry;
  endCap: THREE.BufferGeometry;
  blastBaffle: THREE.BufferGeometry;
  kBaffleCone: THREE.BufferGeometry;
  baffleSpacer: THREE.BufferGeometry;
  boreCoreTube: THREE.BufferGeometry;
}

function buildSuppressorGeometries(): SuppressorMeshes {
  // Hollow titanium outer sleeve (Lathe around Y then rotated to +X):
  // spans X in [0.0, 17.4], outer R = 1.90, inner wall R = 1.66 (2.4 mm Ti-6Al-4V wall)
  const tubePts = [
    new THREE.Vector2(1.18, -0.32), // Rear QD thread overlap collar (flush, zero gap)
    new THREE.Vector2(1.52, -0.32),
    new THREE.Vector2(1.52, 0.72),
    new THREE.Vector2(1.88, 1.05),
    new THREE.Vector2(1.9, 1.45),
    new THREE.Vector2(1.9, 5.2),
    new THREE.Vector2(1.96, 5.38), // Welded circumferential reinforcement band 1
    new THREE.Vector2(1.96, 5.72),
    new THREE.Vector2(1.9, 5.9),
    new THREE.Vector2(1.9, 11.4),
    new THREE.Vector2(1.96, 11.58), // Welded circumferential reinforcement band 2
    new THREE.Vector2(1.96, 11.92),
    new THREE.Vector2(1.9, 12.1),
    new THREE.Vector2(1.9, 16.95),
    new THREE.Vector2(1.76, 17.4),
    new THREE.Vector2(1.64, 17.4),
    new THREE.Vector2(1.64, 1.1),
    new THREE.Vector2(1.18, 0.72),
    new THREE.Vector2(1.18, -0.32),
  ];
  const outerTube = new THREE.LatheGeometry(tubePts, 36);
  outerTube.rotateZ(-Math.PI / 2);
  outerTube.computeVertexNormals();

  // Rear QD ratcheting locking collar with wrench flats
  const qdCollar = new THREE.CylinderGeometry(1.66, 1.66, 1.05, 8);
  qdCollar.rotateZ(-Math.PI / 2);
  qdCollar.translate(0.22, 0, 0);

  // Recessed front flash-hiding endcap ring
  const capPts = [
    new THREE.Vector2(0.56, 16.85),
    new THREE.Vector2(1.66, 16.85),
    new THREE.Vector2(1.66, 17.42),
    new THREE.Vector2(1.22, 17.42),
    new THREE.Vector2(0.84, 17.12),
    new THREE.Vector2(0.56, 17.12),
    new THREE.Vector2(0.56, 16.85),
  ];
  const endCap = new THREE.LatheGeometry(capPts, 32);
  endCap.rotateZ(-Math.PI / 2);
  endCap.computeVertexNormals();

  // Stage-1 Inconel 718 heavy blast baffle cone (thick angled cone facing incoming gas)
  const blastPts = [
    new THREE.Vector2(0.54, 2.35),
    new THREE.Vector2(0.76, 2.35),
    new THREE.Vector2(1.62, 3.68),
    new THREE.Vector2(1.62, 4.02),
    new THREE.Vector2(1.42, 4.02),
    new THREE.Vector2(0.68, 2.75),
    new THREE.Vector2(0.54, 2.75),
    new THREE.Vector2(0.54, 2.35),
  ];
  const blastBaffle = new THREE.LatheGeometry(blastPts, 32);
  blastBaffle.rotateZ(-Math.PI / 2);
  blastBaffle.computeVertexNormals();

  // Reusable monocore K-Baffle cone element (centered locally at X=0, instanced/placed ×6)
  const kPts = [
    new THREE.Vector2(0.52, -0.58),
    new THREE.Vector2(0.7, -0.58),
    new THREE.Vector2(1.6, 0.56),
    new THREE.Vector2(1.6, 0.84),
    new THREE.Vector2(1.42, 0.84),
    new THREE.Vector2(1.42, 0.62),
    new THREE.Vector2(0.66, -0.26),
    new THREE.Vector2(0.52, -0.26),
    new THREE.Vector2(0.52, -0.58),
  ];
  const kBaffleCone = new THREE.LatheGeometry(kPts, 28);
  kBaffleCone.rotateZ(-Math.PI / 2);
  kBaffleCone.computeVertexNormals();

  // Coaxial baffle spacer ring (between K-baffles for secondary pressure-relief pockets)
  const spacerPts = [
    new THREE.Vector2(1.46, -0.82),
    new THREE.Vector2(1.62, -0.82),
    new THREE.Vector2(1.62, 0.82),
    new THREE.Vector2(1.46, 0.82),
    new THREE.Vector2(1.46, -0.82),
  ];
  const baffleSpacer = new THREE.LatheGeometry(spacerPts, 28);
  baffleSpacer.rotateZ(-Math.PI / 2);
  baffleSpacer.computeVertexNormals();

  // Inner dark bore shadow sleeve visible inside cutaway core
  const boreCoreTube = new THREE.CylinderGeometry(0.46, 0.46, 16.6, 20, 1, true);
  boreCoreTube.rotateZ(-Math.PI / 2);
  boreCoreTube.translate(8.6, 0, 0);

  return {
    outerTube,
    qdCollar,
    endCap,
    blastBaffle,
    kBaffleCone,
    baffleSpacer,
    boreCoreTube,
  };
}

interface BrakeMeshes {
  rearCollar: THREE.BufferGeometry;
  spineTop: THREE.BufferGeometry;
  spineBot: THREE.BufferGeometry;
  baffleWall: THREE.BufferGeometry;
  frontCrown: THREE.BufferGeometry;
}

function buildMuzzleBrakeGeometries(): BrakeMeshes {
  // Rear crush washer + hex timing collar overlapping barrel shoulder at X = -0.28..0.85
  const rearCollar = new THREE.CylinderGeometry(1.18, 1.24, 1.18, 16);
  rearCollar.rotateZ(-Math.PI / 2);
  rearCollar.translate(0.3, 0, 0);

  // Upper & lower machined steel bridge plates forming twin open lateral gas chambers
  const spineTop = new THREE.BoxGeometry(5.6, 0.44, 2.24);
  spineTop.translate(3.55, 0.94, 0);

  const spineBot = new THREE.BoxGeometry(5.6, 0.44, 2.24);
  spineBot.translate(3.55, -0.94, 0);

  // Rearward-swept baffle partition wall (placed ×2 to form Dual-Chamber Competition Brake)
  const baffleWall = new THREE.BoxGeometry(0.54, 1.72, 2.38);

  // Front muzzle crown bridge with central projectile exit bore collar
  const crownPts = [
    new THREE.Vector2(0.56, 5.82),
    new THREE.Vector2(1.24, 5.82),
    new THREE.Vector2(1.24, 6.42),
    new THREE.Vector2(1.06, 6.42),
    new THREE.Vector2(0.56, 6.18),
    new THREE.Vector2(0.56, 5.82),
  ];
  const frontCrown = new THREE.LatheGeometry(crownPts, 24);
  frontCrown.rotateZ(-Math.PI / 2);
  frontCrown.computeVertexNormals();

  return { rearCollar, spineTop, spineBot, baffleWall, frontCrown };
}

interface FlashHiderMeshes {
  baseMount: THREE.BufferGeometry;
  prong: THREE.BufferGeometry;
}

function buildFlashHiderGeometries(): FlashHiderMeshes {
  const basePts = [
    new THREE.Vector2(0.54, -0.28),
    new THREE.Vector2(1.16, -0.28),
    new THREE.Vector2(1.22, 0.25),
    new THREE.Vector2(1.18, 1.45),
    new THREE.Vector2(1.05, 1.72),
    new THREE.Vector2(0.58, 1.72),
    new THREE.Vector2(0.54, -0.28),
  ];
  const baseMount = new THREE.LatheGeometry(basePts, 24);
  baseMount.rotateZ(-Math.PI / 2);
  baseMount.computeVertexNormals();

  // Single tapered 3-prong tine (rotated around X at 0°, 120°, 240°)
  const prong = new THREE.BoxGeometry(4.25, 0.34, 0.56);
  prong.translate(3.72, 0.86, 0);

  return { baseMount, prong };
}

interface RedDotMeshes {
  railBase: THREE.BufferGeometry;
  hoodLeft: THREE.BufferGeometry;
  hoodRight: THREE.BufferGeometry;
  hoodTop: THREE.BufferGeometry;
  lens: THREE.BufferGeometry;
  reticleDot: THREE.BufferGeometry;
  emitterDiode: THREE.BufferGeometry;
  turret: THREE.BufferGeometry;
}

function buildRedDotGeometries(): RedDotMeshes {
  // Low-profile MIL-STD-1913 / MOS clamp base seated flush at Y = 0 (claw grips down to -0.06)
  const railBase = new THREE.BoxGeometry(4.65, 0.78, 2.68);
  railBase.translate(0, 0.33, 0);

  // Open-reflex beveled protective aluminum shroud arches
  const hoodLeft = new THREE.BoxGeometry(3.2, 2.28, 0.28);
  hoodLeft.translate(0.35, 1.76, -1.24);

  const hoodRight = new THREE.BoxGeometry(3.2, 2.28, 0.28);
  hoodRight.translate(0.35, 1.76, 1.24);

  const hoodTop = new THREE.BoxGeometry(3.2, 0.3, 2.76);
  hoodTop.translate(0.35, 2.86, 0);

  // Angled ruby multi-coated dichroic reflex lens
  const lens = new THREE.BoxGeometry(0.14, 1.98, 2.22);
  lens.rotateZ(-0.14);
  lens.translate(1.22, 1.74, 0);

  // Glowing 2 MOA HDR red reticle dot suspended in optical plane
  const reticleDot = new THREE.SphereGeometry(0.14, 14, 12);
  reticleDot.translate(1.06, 1.78, 0);

  // Rear micro-LED emitter diode projecting forward onto angled ruby lens (visible in CT slice!)
  const emitterDiode = new THREE.CylinderGeometry(0.18, 0.24, 0.52, 14);
  emitterDiode.rotateZ(-Math.PI / 2 + 0.22);
  emitterDiode.translate(-1.35, 0.92, 0);

  // Windage / elevation brass micro-adjuster turret
  const turret = new THREE.CylinderGeometry(0.24, 0.24, 0.22, 14);

  return {
    railBase,
    hoodLeft,
    hoodRight,
    hoodTop,
    lens,
    reticleDot,
    emitterDiode,
    turret,
  };
}

interface LpvoMeshes {
  railBase: THREE.BufferGeometry;
  cantileverArm: THREE.BufferGeometry;
  ringClamp: THREE.BufferGeometry;
  outerTube: THREE.BufferGeometry;
  erectorTube: THREE.BufferGeometry;
  turretTop: THREE.BufferGeometry;
  turretSide: THREE.BufferGeometry;
  throwLever: THREE.BufferGeometry;
  lensObj: THREE.BufferGeometry;
  lensInner: THREE.BufferGeometry;
  reticleDisk: THREE.BufferGeometry;
  lensOcular: THREE.BufferGeometry;
}

function buildLpvoGeometries(): LpvoMeshes {
  // Full-length cantilever Picatinny base seated flush at Y = 0
  const railBase = new THREE.BoxGeometry(9.6, 0.72, 2.38);
  railBase.translate(-0.6, 0.3, 0);

  // Angled forward-cantilevered CNC riser bridge
  const cantileverArm = new THREE.BoxGeometry(11.4, 1.1, 1.56);
  cantileverArm.translate(0.9, 1.25, 0);

  // 30mm Scope Ring (placed ×2 along the cantilever)
  const ringClamp = new THREE.CylinderGeometry(1.78, 1.78, 1.9, 28, 1, false);
  ringClamp.rotateZ(-Math.PI / 2);

  // Hollow stepped 1-8x24 LPVO outer aluminum scope tube (centered at Y = 3.25)
  const scopePts = [
    new THREE.Vector2(1.88, -12.6), // Ocular eyepiece rim
    new THREE.Vector2(2.14, -12.6),
    new THREE.Vector2(2.14, -7.8),
    new THREE.Vector2(2.26, -7.5), // Magnification power ring
    new THREE.Vector2(2.26, -6.2),
    new THREE.Vector2(1.56, -5.6), // 30mm main tube body
    new THREE.Vector2(1.56, 6.2),
    new THREE.Vector2(1.86, 7.6), // 24mm objective flare
    new THREE.Vector2(1.86, 12.8),
    new THREE.Vector2(1.62, 12.8), // Inner cavity wall (reveals lens stack in CT slice!)
    new THREE.Vector2(1.62, 7.5),
    new THREE.Vector2(1.34, 6.1),
    new THREE.Vector2(1.34, -5.6),
    new THREE.Vector2(1.88, -6.3),
    new THREE.Vector2(1.88, -12.6),
  ];
  const outerTube = new THREE.LatheGeometry(scopePts, 36);
  outerTube.rotateZ(-Math.PI / 2);
  outerTube.translate(1.2, 3.25, 0);
  outerTube.computeVertexNormals();

  // Internal precision brass/steel optical erector tube (visible in CT slice C!)
  const erectorTube = new THREE.CylinderGeometry(0.94, 0.94, 12.6, 24, 1, true);
  erectorTube.rotateZ(-Math.PI / 2);
  erectorTube.translate(0.5, 3.25, 0);

  // Elevation & Windage MIL turret drums
  const turretTop = new THREE.CylinderGeometry(0.86, 0.92, 1.38, 22);
  turretTop.translate(0.6, 5.25, 0);

  const turretSide = new THREE.CylinderGeometry(0.82, 0.88, 1.25, 22);
  turretSide.rotateX(Math.PI / 2);
  turretSide.translate(0.6, 3.25, 1.98);

  // Quick magnification throw lever lug
  const throwLever = new THREE.BoxGeometry(0.55, 1.45, 0.42);
  throwLever.translate(-5.6, 5.45, 0.4);

  // Multi-coated emerald optical lenses (front objective, internal erector elements, FFP reticle, ocular)
  const lensObj = new THREE.CylinderGeometry(1.58, 1.58, 0.42, 28);
  lensObj.rotateZ(-Math.PI / 2);

  const lensInner = new THREE.CylinderGeometry(0.86, 0.86, 0.28, 24);
  lensInner.rotateZ(-Math.PI / 2);

  const reticleDisk = new THREE.CylinderGeometry(0.84, 0.84, 0.08, 24);
  reticleDisk.rotateZ(-Math.PI / 2);
  reticleDisk.translate(3.2, 3.25, 0);

  const lensOcular = new THREE.CylinderGeometry(1.82, 1.82, 0.36, 28);
  lensOcular.rotateZ(-Math.PI / 2);
  lensOcular.translate(-10.8, 3.25, 0);

  return {
    railBase,
    cantileverArm,
    ringClamp,
    outerTube,
    erectorTube,
    turretTop,
    turretSide,
    throwLever,
    lensObj,
    lensInner,
    reticleDisk,
    lensOcular,
  };
}

interface ThermalMeshes {
  railBase: THREE.BufferGeometry;
  chassisOuter: THREE.BufferGeometry;
  lensHood: THREE.BufferGeometry;
  germaniumLens: THREE.BufferGeometry;
  batteryPod: THREE.BufferGeometry;
  keypadButton: THREE.BufferGeometry;
  eyecup: THREE.BufferGeometry;
  voxSensor: THREE.BufferGeometry;
  dspPcb: THREE.BufferGeometry;
  oledPrism: THREE.BufferGeometry;
}

function buildThermalGeometries(): ThermalMeshes {
  // Twin-lever QD Picatinny rail clamp base seated flush at Y = 0
  const railBase = new THREE.BoxGeometry(8.8, 0.78, 2.52);
  railBase.translate(0, 0.33, 0);

  // Ruggedized magnesium-alloy clip-on FLIR chassis (hollowed for CT slice!)
  const chassisOuter = new THREE.BoxGeometry(10.6, 4.15, 4.45);
  chassisOuter.translate(0.2, 2.8, 0);

  // Front circular lens bezel & flip hood
  const hoodPts = [
    new THREE.Vector2(1.48, 5.4),
    new THREE.Vector2(1.92, 5.4),
    new THREE.Vector2(2.04, 7.2),
    new THREE.Vector2(1.78, 7.45),
    new THREE.Vector2(1.62, 7.45),
    new THREE.Vector2(1.62, 5.55),
    new THREE.Vector2(1.48, 5.4),
  ];
  const lensHood = new THREE.LatheGeometry(hoodPts, 32);
  lensHood.rotateZ(-Math.PI / 2);
  lensHood.translate(0, 2.85, 0);
  lensHood.computeVertexNormals();

  // Single-crystal Germanium LWIR metallic-violet objective lens
  const germaniumLens = new THREE.CylinderGeometry(1.56, 1.56, 0.44, 30);
  germaniumLens.rotateZ(-Math.PI / 2);
  germaniumLens.translate(6.15, 2.85, 0);

  // Left-flank CR123 battery pod cylinder
  const batteryPod = new THREE.CylinderGeometry(0.76, 0.76, 5.4, 20);
  batteryPod.rotateZ(-Math.PI / 2);
  batteryPod.translate(-0.6, 2.35, -2.55);

  // Top tactile control button
  const keypadButton = new THREE.CylinderGeometry(0.32, 0.36, 0.24, 14);

  // Rear micro-OLED ocular shroud & rubber eyecup
  const eyePts = [
    new THREE.Vector2(1.12, -6.9),
    new THREE.Vector2(1.42, -6.9),
    new THREE.Vector2(1.26, -5.05),
    new THREE.Vector2(1.06, -5.05),
    new THREE.Vector2(1.12, -6.9),
  ];
  const eyecup = new THREE.LatheGeometry(eyePts, 28);
  eyecup.rotateZ(-Math.PI / 2);
  eyecup.translate(0, 2.85, 0);
  eyecup.computeVertexNormals();

  // Internal VOx microbolometer gold focal-plane array die (visible in CT slice!)
  const voxSensor = new THREE.BoxGeometry(0.34, 1.68, 1.68);
  voxSensor.translate(2.4, 2.85, 0);

  // Internal green/emerald DSP electronics board
  const dspPcb = new THREE.BoxGeometry(4.4, 0.24, 2.85);
  dspPcb.translate(-0.6, 1.45, 0);

  // Internal rear micro-OLED prism display
  const oledPrism = new THREE.BoxGeometry(1.85, 1.55, 1.55);
  oledPrism.translate(-3.4, 2.85, 0);

  return {
    railBase,
    chassisOuter,
    lensHood,
    germaniumLens,
    batteryPod,
    keypadButton,
    eyecup,
    voxSensor,
    dspPcb,
    oledPrism,
  };
}

// ============================================================================
// Sub-Components for Muzzle & Optic Assemblies
// ============================================================================

const K_BAFFLE_XS = [5.4, 7.25, 9.1, 10.95, 12.8, 14.65] as const;
const LPVO_INNER_LENS_XS = [-4.2, -1.0, 2.1, 6.8] as const;
const THERMAL_BTN_XS = [-2.4, -0.8, 0.8, 2.4] as const;
const PRONG_ANGLES = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3] as const;

interface MuzzleMeshGroupProps {
  muzzleId: Exclude<MuzzleAttachmentId, 'none'>;
  clipPlanes: THREE.Plane[] | null;
  sectionCut: boolean;
}

const MuzzleMeshGroup: React.FC<MuzzleMeshGroupProps> = React.memo(
  ({ muzzleId, clipPlanes, sectionCut }) => {
    const suppGeos = useMemo(
      () => (muzzleId === 'suppressor' ? buildSuppressorGeometries() : null),
      [muzzleId]
    );
    const brakeGeos = useMemo(
      () => (muzzleId === 'muzzle_brake' ? buildMuzzleBrakeGeometries() : null),
      [muzzleId]
    );
    const fhGeos = useMemo(
      () => (muzzleId === 'flash_hider' ? buildFlashHiderGeometries() : null),
      [muzzleId]
    );

    useEffect(() => {
      return () => {
        if (suppGeos) Object.values(suppGeos).forEach((g) => g.dispose());
        if (brakeGeos) Object.values(brakeGeos).forEach((g) => g.dispose());
        if (fhGeos) Object.values(fhGeos).forEach((g) => g.dispose());
      };
    }, [suppGeos, brakeGeos, fhGeos]);

    const shellSide = sectionCut ? THREE.DoubleSide : THREE.FrontSide;
    const matKey = sectionCut ? `cut-${clipPlanes?.length ?? 0}` : 'solid';

    if (muzzleId === 'suppressor' && suppGeos) {
      return (
        <group name="AttachmentMuzzleSuppressor">
          {/* Outer Titanium-6Al-4V Sleeve (slices cleanly in CT mode!) */}
          <mesh
            geometry={suppGeos.outerTube}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`supp-tube-${matKey}`}
              color="#55606e"
              metalness={0.86}
              roughness={0.31}
              clearcoat={0.18}
              clearcoatRoughness={0.24}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Rear QD Ratcheting Locking Collar */}
          <mesh
            geometry={suppGeos.qdCollar}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`supp-qd-${matKey}`}
              color="#3a424e"
              metalness={0.88}
              roughness={0.28}
              envMapIntensity={1.4}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Front Flash-Reducing Endcap */}
          <mesh
            geometry={suppGeos.endCap}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`supp-cap-${matKey}`}
              color="#434d5b"
              metalness={0.88}
              roughness={0.26}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Internal Blast Baffle (Warm Inconel 718 — gleams inside CT Slice!) */}
          <mesh
            geometry={suppGeos.blastBaffle}
            raycast={noRaycast}
            renderOrder={3}
          >
            <meshPhysicalMaterial
              key={`supp-blast-${matKey}`}
              color="#c29b62"
              metalness={0.92}
              roughness={0.24}
              envMapIntensity={1.55}
              clippingPlanes={clipPlanes}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* 6-Stage CNC Monocore K-Baffle Cones + Coaxial Spacers (Cutaway Showcase!) */}
          {K_BAFFLE_XS.map((bx, idx) => (
            <group key={`kbaffle-${idx}`} position={[bx, 0, 0]}>
              <mesh
                geometry={suppGeos.kBaffleCone}
                raycast={noRaycast}
                renderOrder={3}
              >
                <meshPhysicalMaterial
                  key={`supp-kb-${matKey}`}
                  color={idx % 2 === 0 ? '#9aa6b5' : '#b2becd'}
                  metalness={0.94}
                  roughness={0.21}
                  envMapIntensity={1.6}
                  clippingPlanes={clipPlanes}
                  side={THREE.DoubleSide}
                />
              </mesh>
              <mesh
                geometry={suppGeos.baffleSpacer}
                raycast={noRaycast}
                renderOrder={2}
              >
                <meshPhysicalMaterial
                  key={`supp-sp-${matKey}`}
                  color="#687382"
                  metalness={0.84}
                  roughness={0.34}
                  clippingPlanes={clipPlanes}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          ))}

          {/* Dark Internal Carbon-Fouled Bore Axis Liner */}
          {sectionCut && (
            <mesh
              geometry={suppGeos.boreCoreTube}
              raycast={noRaycast}
              renderOrder={2}
            >
              <meshStandardMaterial
                color="#1f2937"
                metalness={0.4}
                roughness={0.8}
                clippingPlanes={clipPlanes}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}
        </group>
      );
    }

    if (muzzleId === 'muzzle_brake' && brakeGeos) {
      return (
        <group name="AttachmentMuzzleBrake">
          <mesh
            geometry={brakeGeos.rearCollar}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`brk-c-${matKey}`}
              color="#3d4552"
              metalness={0.88}
              roughness={0.28}
              envMapIntensity={1.5}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={brakeGeos.spineTop}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`brk-t-${matKey}`}
              color="#475161"
              metalness={0.86}
              roughness={0.3}
              envMapIntensity={1.5}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={brakeGeos.spineBot}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`brk-b-${matKey}`}
              color="#475161"
              metalness={0.86}
              roughness={0.3}
              envMapIntensity={1.5}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          {/* Twin Rearward-Swept Competition Baffle Walls */}
          <mesh
            geometry={brakeGeos.baffleWall}
            position={[2.45, 0, 0]}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`brk-w1-${matKey}`}
              color="#7a8596"
              metalness={0.92}
              roughness={0.22}
              envMapIntensity={1.58}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={brakeGeos.baffleWall}
            position={[4.45, 0, 0]}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`brk-w2-${matKey}`}
              color="#7a8596"
              metalness={0.92}
              roughness={0.22}
              envMapIntensity={1.58}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={brakeGeos.frontCrown}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`brk-cr-${matKey}`}
              color="#414b59"
              metalness={0.88}
              roughness={0.27}
              envMapIntensity={1.5}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
        </group>
      );
    }

    if (muzzleId === 'flash_hider' && fhGeos) {
      return (
        <group name="AttachmentMuzzleFlashHider">
          <mesh
            geometry={fhGeos.baseMount}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`fh-base-${matKey}`}
              color="#3d4552"
              metalness={0.88}
              roughness={0.28}
              envMapIntensity={1.5}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          {PRONG_ANGLES.map((ang, idx) => (
            <mesh
              key={`prong-${idx}`}
              geometry={fhGeos.prong}
              rotation={[ang, 0, 0]}
              castShadow
              receiveShadow
              raycast={noRaycast}
            >
              <meshPhysicalMaterial
                key={`fh-pr-${matKey}`}
                color="#4d5766"
                metalness={0.9}
                roughness={0.25}
                envMapIntensity={1.55}
                clippingPlanes={clipPlanes}
                clipShadows={sectionCut}
                side={shellSide}
              />
            </mesh>
          ))}
        </group>
      );
    }

    return null;
  }
);
MuzzleMeshGroup.displayName = 'MuzzleMeshGroup';

interface OpticMeshGroupProps {
  opticId: Exclude<OpticAttachmentId, 'none'>;
  clipPlanes: THREE.Plane[] | null;
  sectionCut: boolean;
}

const OpticMeshGroup: React.FC<OpticMeshGroupProps> = React.memo(
  ({ opticId, clipPlanes, sectionCut }) => {
    const rdGeos = useMemo(
      () => (opticId === 'red_dot' ? buildRedDotGeometries() : null),
      [opticId]
    );
    const lpvoGeos = useMemo(
      () => (opticId === 'lpvo' ? buildLpvoGeometries() : null),
      [opticId]
    );
    const thermalGeos = useMemo(
      () => (opticId === 'thermal' ? buildThermalGeometries() : null),
      [opticId]
    );

    useEffect(() => {
      return () => {
        if (rdGeos) Object.values(rdGeos).forEach((g) => g.dispose());
        if (lpvoGeos) Object.values(lpvoGeos).forEach((g) => g.dispose());
        if (thermalGeos) Object.values(thermalGeos).forEach((g) => g.dispose());
      };
    }, [rdGeos, lpvoGeos, thermalGeos]);

    const shellSide = sectionCut ? THREE.DoubleSide : THREE.FrontSide;
    const matKey = sectionCut ? `cut-${clipPlanes?.length ?? 0}` : 'solid';

    if (opticId === 'red_dot' && rdGeos) {
      return (
        <group name="AttachmentOpticRedDot">
          <mesh
            geometry={rdGeos.railBase}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`rd-base-${matKey}`}
              color="#373f4b"
              metalness={0.82}
              roughness={0.34}
              envMapIntensity={1.4}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={rdGeos.hoodLeft}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`rd-hl-${matKey}`}
              color="#434c5a"
              metalness={0.84}
              roughness={0.32}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={rdGeos.hoodRight}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`rd-hr-${matKey}`}
              color="#434c5a"
              metalness={0.84}
              roughness={0.32}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={rdGeos.hoodTop}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`rd-ht-${matKey}`}
              color="#434c5a"
              metalness={0.84}
              roughness={0.32}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Micro Windage / Elevation Brass Adjusters */}
          <mesh
            geometry={rdGeos.turret}
            position={[-0.65, 0.78, 0.72]}
            raycast={noRaycast}
          >
            <meshStandardMaterial
              color="#c89d4e"
              metalness={0.92}
              roughness={0.24}
              clippingPlanes={clipPlanes}
            />
          </mesh>
          <mesh
            geometry={rdGeos.turret}
            position={[-0.65, 0.48, 1.38]}
            rotation={[Math.PI / 2, 0, 0]}
            raycast={noRaycast}
          >
            <meshStandardMaterial
              color="#c89d4e"
              metalness={0.92}
              roughness={0.24}
              clippingPlanes={clipPlanes}
            />
          </mesh>

          {/* Internal LED Projector Diode */}
          <mesh
            geometry={rdGeos.emitterDiode}
            raycast={noRaycast}
            renderOrder={4}
          >
            <meshStandardMaterial
              color="#ef4444"
              emissive="#ef4444"
              emissiveIntensity={1.8}
              metalness={0.6}
              roughness={0.2}
            />
          </mesh>

          {/* Ruby AR Multi-Coated Dichroic Reflex Lens */}
          <mesh geometry={rdGeos.lens} raycast={noRaycast} renderOrder={5}>
            <meshPhysicalMaterial
              color="#be123c"
              metalness={0.18}
              roughness={0.08}
              transmission={0.68}
              transparent
              opacity={0.58}
              ior={1.52}
              iridescence={0.85}
              iridescenceIOR={1.38}
              envMapIntensity={1.8}
              depthWrite={false}
            />
          </mesh>

          {/* Glowing HDR 2 MOA Red Reticle Dot */}
          <mesh
            geometry={rdGeos.reticleDot}
            raycast={noRaycast}
            renderOrder={6}
          >
            <meshBasicMaterial
              color={HDR_RED_DOT_COLOR}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
        </group>
      );
    }

    if (opticId === 'lpvo' && lpvoGeos) {
      return (
        <group name="AttachmentOpticLPVO">
          {/* Cantilever Rail Base + Riser Arm + Twin 30mm Rings */}
          <mesh
            geometry={lpvoGeos.railBase}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`lpvo-base-${matKey}`}
              color="#39424f"
              metalness={0.84}
              roughness={0.33}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={lpvoGeos.cantileverArm}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`lpvo-arm-${matKey}`}
              color="#434d5c"
              metalness={0.84}
              roughness={0.31}
              envMapIntensity={1.45}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>
          {[-2.9, 4.1].map((rx, idx) => (
            <mesh
              key={`lpvo-ring-${idx}`}
              geometry={lpvoGeos.ringClamp}
              position={[rx, 3.25, 0]}
              castShadow
              receiveShadow
              raycast={noRaycast}
            >
              <meshPhysicalMaterial
                key={`lpvo-rg-${matKey}`}
                color="#37404d"
                metalness={0.86}
                roughness={0.29}
                envMapIntensity={1.5}
                clippingPlanes={clipPlanes}
                clipShadows={sectionCut}
                side={shellSide}
              />
            </mesh>
          ))}

          {/* 30mm Stepped Main Scope Tube (Slices cleanly in CT mode!) */}
          <mesh
            geometry={lpvoGeos.outerTube}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`lpvo-tube-${matKey}`}
              color="#485362"
              metalness={0.86}
              roughness={0.29}
              clearcoat={0.22}
              clearcoatRoughness={0.2}
              envMapIntensity={1.55}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Capped MIL Elevation / Windage Turrets & Magnification Throw Lever */}
          <mesh
            geometry={lpvoGeos.turretTop}
            castShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`lpvo-tt-${matKey}`}
              color="#3a4350"
              metalness={0.86}
              roughness={0.27}
              clippingPlanes={clipPlanes}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={lpvoGeos.turretSide}
            castShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`lpvo-ts-${matKey}`}
              color="#3a4350"
              metalness={0.86}
              roughness={0.27}
              clippingPlanes={clipPlanes}
              side={shellSide}
            />
          </mesh>
          <mesh
            geometry={lpvoGeos.throwLever}
            castShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              color="#55606e"
              metalness={0.88}
              roughness={0.26}
              clippingPlanes={clipPlanes}
            />
          </mesh>

          {/* Internal Brass/Steel Optical Erector Tube (Visible inside CT Slice C!) */}
          <mesh
            geometry={lpvoGeos.erectorTube}
            raycast={noRaycast}
            renderOrder={3}
          >
            <meshPhysicalMaterial
              key={`lpvo-erec-${matKey}`}
              color="#b5945b"
              metalness={0.92}
              roughness={0.24}
              clippingPlanes={clipPlanes}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Emerald Multi-Coated Objective & Ocular ED Glass Lenses */}
          <mesh
            geometry={lpvoGeos.lensObj}
            position={[13.3, 3.25, 0]}
            raycast={noRaycast}
            renderOrder={5}
          >
            <meshPhysicalMaterial
              color="#10b981"
              metalness={0.14}
              roughness={0.06}
              transparent
              opacity={0.72}
              ior={1.54}
              iridescence={0.9}
              iridescenceIOR={1.36}
              envMapIntensity={1.9}
            />
          </mesh>
          <mesh
            geometry={lpvoGeos.lensOcular}
            raycast={noRaycast}
            renderOrder={5}
          >
            <meshPhysicalMaterial
              color="#059669"
              metalness={0.14}
              roughness={0.07}
              transparent
              opacity={0.7}
              ior={1.54}
              iridescence={0.85}
              iridescenceIOR={1.36}
              envMapIntensity={1.85}
            />
          </mesh>

          {/* Internal 4-Element Optical Lens Stack + Illuminated FFP Reticle (CT Showcase!) */}
          {sectionCut &&
            LPVO_INNER_LENS_XS.map((lx, idx) => (
              <mesh
                key={`lpvo-ilens-${idx}`}
                geometry={lpvoGeos.lensInner}
                position={[lx, 3.25, 0]}
                raycast={noRaycast}
                renderOrder={5}
              >
                <meshPhysicalMaterial
                  color={idx % 2 === 0 ? '#34d399' : '#38bdf8'}
                  metalness={0.1}
                  roughness={0.05}
                  transparent
                  opacity={0.62}
                  iridescence={0.9}
                  depthWrite={false}
                />
              </mesh>
            ))}
          {sectionCut && (
            <mesh
              geometry={lpvoGeos.reticleDisk}
              raycast={noRaycast}
              renderOrder={6}
            >
              <meshBasicMaterial
                color="#f43f5e"
                transparent
                opacity={0.78}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>
      );
    }

    if (opticId === 'thermal' && thermalGeos) {
      return (
        <group name="AttachmentOpticThermal">
          {/* QD Picatinny Rail Mount Base */}
          <mesh
            geometry={thermalGeos.railBase}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`th-base-${matKey}`}
              color="#373f4b"
              metalness={0.84}
              roughness={0.33}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Ruggedized Magnesium-Alloy Clip-On FLIR Chassis */}
          <mesh
            geometry={thermalGeos.chassisOuter}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`th-ch-${matKey}`}
              color="#434d5b"
              metalness={0.42}
              roughness={0.56}
              envMapIntensity={1.15}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Front Objective Bezel & Flip Hood */}
          <mesh
            geometry={thermalGeos.lensHood}
            castShadow
            receiveShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              key={`th-hood-${matKey}`}
              color="#353d49"
              metalness={0.76}
              roughness={0.36}
              clippingPlanes={clipPlanes}
              clipShadows={sectionCut}
              side={shellSide}
            />
          </mesh>

          {/* Iconic Metallic-Violet / Bronze Single-Crystal Germanium LWIR Lens */}
          <mesh
            geometry={thermalGeos.germaniumLens}
            raycast={noRaycast}
            renderOrder={5}
          >
            <meshPhysicalMaterial
              color="#7b5ba6"
              metalness={0.76}
              roughness={0.1}
              clearcoat={0.9}
              clearcoatRoughness={0.08}
              iridescence={1.0}
              iridescenceIOR={1.85}
              envMapIntensity={2.0}
            />
          </mesh>

          {/* Side CR123 Battery Cylinder */}
          <mesh
            geometry={thermalGeos.batteryPod}
            castShadow
            raycast={noRaycast}
          >
            <meshPhysicalMaterial
              color="#39424f"
              metalness={0.78}
              roughness={0.35}
              clippingPlanes={clipPlanes}
            />
          </mesh>

          {/* Top 4-Button Tactile Control Keypad */}
          {THERMAL_BTN_XS.map((bx, idx) => (
            <mesh
              key={`th-btn-${idx}`}
              geometry={thermalGeos.keypadButton}
              position={[bx, 4.96, 0]}
              raycast={noRaycast}
            >
              <meshStandardMaterial
                color={idx === 0 ? '#f59e0b' : '#64748b'}
                metalness={0.2}
                roughness={0.68}
                clippingPlanes={clipPlanes}
              />
            </mesh>
          ))}

          {/* Rear Micro-OLED Ocular Eyecup */}
          <mesh
            geometry={thermalGeos.eyecup}
            castShadow
            raycast={noRaycast}
          >
            <meshStandardMaterial
              color="#2f3640"
              metalness={0.05}
              roughness={0.82}
              clippingPlanes={clipPlanes}
              side={shellSide}
            />
          </mesh>

          {/* Internal VOx Microbolometer Die + DSP PCB + OLED Prism (Visible in CT Slice C!) */}
          {sectionCut && (
            <group name="ThermalCutawayInternals">
              <mesh
                geometry={thermalGeos.voxSensor}
                raycast={noRaycast}
                renderOrder={4}
              >
                <meshPhysicalMaterial
                  color="#eab308"
                  metalness={0.94}
                  roughness={0.16}
                  emissive="#ca8a04"
                  emissiveIntensity={0.22}
                />
              </mesh>
              <mesh
                geometry={thermalGeos.dspPcb}
                raycast={noRaycast}
                renderOrder={4}
              >
                <meshStandardMaterial
                  color="#15803d"
                  metalness={0.35}
                  roughness={0.42}
                />
              </mesh>
              <mesh
                geometry={thermalGeos.oledPrism}
                raycast={noRaycast}
                renderOrder={4}
              >
                <meshPhysicalMaterial
                  color="#38bdf8"
                  emissive="#0ea5e9"
                  emissiveIntensity={0.55}
                  metalness={0.2}
                  roughness={0.14}
                />
              </mesh>
            </group>
          )}
        </group>
      );
    }

    return null;
  }
);
OpticMeshGroup.displayName = 'OpticMeshGroup';

// ============================================================================
// Main AttachmentActor — Mounted Inside <WeaponRecoilGroup> in ArmoryViewport
// ============================================================================

export const AttachmentActor: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const screen = useAppStore((s) => s.screen);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const sectionCutAxis = useAppStore((s) => s.sectionCutAxis);

  const loadout = useAttachmentStore(
    (s) => s.loadouts[activeWeaponId] ?? DEFAULT_ATTACHMENT_LOADOUT
  );

  const muzzleGroupRef = useRef<THREE.Group>(null);
  const opticGroupRef = useRef<THREE.Group>(null);

  const profile = getWeaponAttachmentMountProfile(activeWeaponId);
  const clipPlanes = sectionCut
    ? sectionCutAxis === 'box'
      ? SECTION_CUT_BOX_PLANES
      : SECTION_CUT_PLANES
    : null;

  const hasMuzzle =
    loadout.muzzle !== 'none' &&
    profile.muzzleAnchor !== null &&
    profile.allowedMuzzles.includes(loadout.muzzle);

  const hasOptic =
    loadout.optic !== 'none' &&
    profile.opticRailAnchor !== null &&
    profile.allowedOptics.includes(loadout.optic);

  // Zero-GC 60fps kinematic & disassembly tracking:
  //  - In `firing` mode, follows reciprocating barrels (M82A1, G17, P320, P08, AN-94, G11)
  //    and reciprocating pistol slides (G17, P320) 1:1.
  //  - In `explode` mode, translates attachments along their natural gunsmith removal axes.
  useFrame(() => {
    const appState = useAppStore.getState();
    const clock = playbackClock.getState();
    const isFiring = appState.mode === 'firing';
    const isExplode = appState.mode === 'explode' && !appState.fieldStripActive;
    const tExplode = isExplode ? clock.animatedProgress : 0;
    const f = isFiring ? clock.animatedFireProgress : 0;
    const plugin = isFiring
      ? getLoadedWeaponPlugin(appState.activeWeaponId)
      : null;

    if (muzzleGroupRef.current && profile.muzzleAnchor) {
      let mx = profile.muzzleAnchor[0];
      let my = profile.muzzleAnchor[1];
      let mz = profile.muzzleAnchor[2];
      let rx = 0;
      let ry = 0;
      let rz = 0;

      if (isFiring && plugin && profile.muzzleFollowPartId) {
        const kd = plugin.computeFiringKinematics(
          profile.muzzleFollowPartId,
          f
        );
        if (kd.pos) {
          mx += kd.pos[0];
          my += kd.pos[1];
          mz += kd.pos[2];
        }
        if (kd.rot) {
          rx += kd.rot[0];
          ry += kd.rot[1];
          rz += kd.rot[2];
        }
      } else if (tExplode > 1e-4) {
        mx += 5.4 * profile.modelScale * tExplode;
      }

      muzzleGroupRef.current.position.set(mx, my, mz);
      muzzleGroupRef.current.rotation.set(rx, ry, rz);
      muzzleGroupRef.current.scale.setScalar(profile.modelScale);
    }

    if (opticGroupRef.current && profile.opticRailAnchor) {
      let ox = profile.opticRailAnchor[0];
      let oy = profile.opticRailAnchor[1];
      let oz = profile.opticRailAnchor[2];
      let rx = 0;
      let ry = 0;
      let rz = 0;

      if (isFiring && plugin && profile.opticFollowPartId) {
        const kd = plugin.computeFiringKinematics(profile.opticFollowPartId, f);
        if (kd.pos) {
          ox += kd.pos[0];
          oy += kd.pos[1];
          oz += kd.pos[2];
        }
        if (kd.rot) {
          rx += kd.rot[0];
          ry += kd.rot[1];
          rz += kd.rot[2];
        }
      } else if (tExplode > 1e-4) {
        oy += 4.2 * profile.modelScale * tExplode;
      }

      opticGroupRef.current.position.set(ox, oy, oz);
      opticGroupRef.current.rotation.set(rx, ry, rz);
      opticGroupRef.current.scale.setScalar(profile.modelScale);
    }
  });

  if (
    screen === 'cartridges' ||
    screen === 'ballistics' ||
    (!hasMuzzle && !hasOptic)
  ) {
    return null;
  }

  return (
    <group name="ModularAttachmentRig">
      {hasMuzzle && profile.muzzleAnchor && (
        <group
          ref={muzzleGroupRef}
          position={[
            profile.muzzleAnchor[0],
            profile.muzzleAnchor[1],
            profile.muzzleAnchor[2],
          ]}
          scale={profile.modelScale}
        >
          <MuzzleMeshGroup
            muzzleId={loadout.muzzle}
            clipPlanes={clipPlanes}
            sectionCut={sectionCut}
          />
        </group>
      )}

      {hasOptic && profile.opticRailAnchor && (
        <group
          ref={opticGroupRef}
          position={[
            profile.opticRailAnchor[0],
            profile.opticRailAnchor[1],
            profile.opticRailAnchor[2],
          ]}
          scale={profile.modelScale}
        >
          <OpticMeshGroup
            opticId={loadout.optic}
            clipPlanes={clipPlanes}
            sectionCut={sectionCut}
          />
        </group>
      )}
    </group>
  );
};

AttachmentActor.displayName = 'AttachmentActor';
