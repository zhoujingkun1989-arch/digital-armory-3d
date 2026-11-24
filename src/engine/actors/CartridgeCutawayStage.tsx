import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { useAppStore } from '../../store/useAppStore';
import type { CaliberProfile } from '../../weapons/types';
import {
  CARTRIDGE_LAB_ORDER,
  CARTRIDGE_LAB_SPECS,
  getCartridgeLabMeshBundle,
  isTankOrdnanceProfile,
  TANK_ORDNANCE_ORDER,
} from '../cartridges/cartridgeSpecs';

/** Vertical datum floor of the 1:1 Cartridge Cutaway Lab (`y = -3.8 cm` in world space) */
export const CARTRIDGE_STAGE_DATUM_Y = -3.8;

/**
 * Small-arms 1:1 CNC elevation ruler horizontal stiles (cm).
 * Right rail sits at `+23.5 cm` (`+1.5 cm` past legacy `+22.0 cm`, giving `2.7 cm` center-to-stile
 * clearance from `.50 BMG` at `lineupXCm = 20.8 cm` so `120 mm / 100 mm` labels never overlap).
 */
export const SMALL_ARMS_RULER_LEFT_X = -21.8;
export const SMALL_ARMS_RULER_RIGHT_X = 23.5;

const TAN_HALF_FOV_41 = Math.tan(THREE.MathUtils.degToRad(41 * 0.5));

let cartridgeDossierCollapsed = false;
const dossierCollapsedListeners = new Set<() => void>();

export function getCartridgeDossierCollapsed(): boolean {
  return cartridgeDossierCollapsed;
}

export function setCartridgeDossierCollapsed(collapsed: boolean): void {
  if (cartridgeDossierCollapsed === collapsed) return;
  cartridgeDossierCollapsed = collapsed;
  for (const fn of dossierCollapsedListeners) {
    fn();
  }
}

export function subscribeCartridgeDossierCollapsed(
  listener: () => void
): () => void {
  dossierCollapsedListeners.add(listener);
  return () => {
    dossierCollapsedListeners.delete(listener);
  };
}

export type CartridgeAnatomyLayer = 'core' | 'propellant' | 'primer';

let cartridgeHighlightLayer: CartridgeAnatomyLayer | null = null;
const highlightLayerListeners = new Set<() => void>();

export function getCartridgeHighlightLayer(): CartridgeAnatomyLayer | null {
  return cartridgeHighlightLayer;
}

export function setCartridgeHighlightLayer(
  layer: CartridgeAnatomyLayer | null
): void {
  if (cartridgeHighlightLayer === layer) return;
  cartridgeHighlightLayer = layer;
  for (const fn of highlightLayerListeners) {
    fn();
  }
}

export function subscribeCartridgeHighlightLayer(
  listener: () => void
): () => void {
  highlightLayerListeners.add(listener);
  return () => {
    highlightLayerListeners.delete(listener);
  };
}

const LAYER_EMISSIVE_OFF = new THREE.Color(0x000000);
const LAYER_EMISSIVE_CORE = new THREE.Color(0x38bdf8);
const LAYER_EMISSIVE_PROPELLANT = new THREE.Color(0xf97316);
const LAYER_EMISSIVE_PRIMER = new THREE.Color(0xfbbf24);

function applyLayerHighlightInPlace(
  mesh: THREE.Mesh | null,
  active: boolean,
  tint: THREE.Color,
  intensity: number
): void {
  if (!mesh) return;
  const mat = mesh.material;
  if (
    !(
      mat instanceof THREE.MeshStandardMaterial ||
      mat instanceof THREE.MeshPhysicalMaterial
    )
  ) {
    return;
  }
  if (active) {
    mat.emissive.copy(tint);
    mat.emissiveIntensity = intensity;
  } else if (mat.emissiveIntensity !== 0) {
    mat.emissive.copy(LAYER_EMISSIVE_OFF);
    mat.emissiveIntensity = 0;
  }
}

interface StageOffsetVec {
  x: number;
  y: number;
  z: number;
}

const _stageOffsetScratch: StageOffsetVec = { x: 0, y: 0, z: 0 };

export function computeCartridgeStageOffsetInto(
  viewportW: number,
  viewportH: number,
  lineupOverview: boolean,
  activeCaliber: CaliberProfile,
  dossierCollapsed: boolean,
  hudHidden: boolean,
  explodeT: number,
  out: StageOffsetVec = _stageOffsetScratch
): StageOffsetVec {
  if (viewportW <= 0 || viewportH <= 0) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }

  const aspect = Math.max(0.45, viewportW / Math.max(1, viewportH));
  const isTankGallery = isTankOrdnanceProfile(activeCaliber);

  if (!lineupOverview) {
    // Macro (Focus) mode: proportional Z pullback & upward target lift (-Y stage shift)
    // so 85%–100% axially exploded buckshot/penetrator stacks stay inside top/bottom HUD bounds
    const spec = CARTRIDGE_LAB_SPECS[activeCaliber];
    const oalCm = spec.oalMm / 10;
    const caseH = spec.caseLengthMm / 10;
    const scaleSpan = isTankGallery
      ? caseH * 0.22
      : Math.max(0.75, caseH * 0.32);
    const hasPenetrator =
      spec.coreKind === 'm33_heavy_steel' ||
      spec.coreKind === 'steel_core_lead_shirt' ||
      spec.coreKind === 'subsonic_tungsten_ap' ||
      spec.coreKind === 'dual_core_penetrator' ||
      spec.coreKind === 'ap_steel_alu' ||
      spec.coreKind === 'apfsds_sabot_dart' ||
      spec.coreKind === 'apcbc_he_shell';
    const topExtra = scaleSpan * (hasPenetrator ? 2.28 : 1.72);
    const botExtra = (isTankGallery ? 3.2 : 0.95) + scaleSpan * 0.35;
    const closeZ =
      Math.max(isTankGallery ? 95 : 8.2, oalCm * (isTankGallery ? 1.65 : 1.72)) *
      Math.max(1, 0.92 / aspect);

    out.x = 0;
    out.y = -explodeT * ((topExtra - botExtra) * 0.52 + oalCm * 0.08);
    out.z = -explodeT * (closeZ * 0.72 + scaleSpan * 1.35);
    return out;
  }

  const leftOccludedPx =
    hudHidden || dossierCollapsed || viewportW < 860
      ? 20
      : Math.min(358, viewportW * 0.32);
  const rightMarginPx = 22;

  const availFracX = Math.max(
    0.42,
    (viewportW - leftOccludedPx - rightMarginPx) / viewportW
  );
  const openCenterPx = (leftOccludedPx + (viewportW - rightMarginPx)) * 0.5;
  const ndcCenterX = (openCenterPx / viewportW) * 2 - 1;

  if (isTankGallery) {
    const camX = 0;
    const camZ = Math.max(198, 228 / aspect);
    const stageSpanX = 104;
    const stageSpanY = 126 + 56 * explodeT;

    const dHoriz =
      (stageSpanX * 0.5) / (TAN_HALF_FOV_41 * aspect * availFracX);
    const dVert = (stageSpanY * 0.5) / (TAN_HALF_FOV_41 * 0.64);
    const desiredDist = Math.max(198, dHoriz, dVert);

    const worldOpenCenterX =
      camX + ndcCenterX * desiredDist * TAN_HALF_FOV_41 * aspect;

    out.x = worldOpenCenterX;
    out.y = -2.0 - 22.0 * explodeT;
    out.z = camZ - desiredDist;
    return out;
  }

  const camX = 1.6;
  const camZ = Math.max(29.5, 36.0 / aspect);

  const stageSpanX = 49.6;
  const stageSpanY = 17.6 + 13.8 * explodeT;

  const dHoriz =
    (stageSpanX * 0.5) / (TAN_HALF_FOV_41 * aspect * availFracX);
  const dVert = (stageSpanY * 0.5) / (TAN_HALF_FOV_41 * 0.68);
  const desiredDist = Math.max(38.0, dHoriz, dVert);

  const worldOpenCenterX =
    camX + ndcCenterX * desiredDist * TAN_HALF_FOV_41 * aspect;

  out.x = worldOpenCenterX - 0.75;
  out.y = -0.55 - 3.65 * explodeT;
  out.z = camZ - desiredDist;
  return out;
}

const PLINTH_GEO = new THREE.BoxGeometry(47.8, 0.85, 11.5);
const PEDESTAL_DISC_GEO = new THREE.CylinderGeometry(1.22, 1.34, 0.16, 36);
const ACTIVE_HALO_GEO = (() => {
  const g = new THREE.RingGeometry(1.3, 1.46, 40);
  g.rotateX(-Math.PI / 2);
  return g;
})();

const TANK_PLINTH_GEO = new THREE.BoxGeometry(102.0, 2.8, 26.0);
const TANK_PEDESTAL_DISC_GEO = new THREE.CylinderGeometry(7.6, 8.3, 0.8, 40);
const TANK_ACTIVE_HALO_GEO = (() => {
  const g = new THREE.RingGeometry(8.4, 9.4, 48);
  g.rotateX(-Math.PI / 2);
  return g;
})();
const ACTIVE_INNER_HALO_GEO = (() => {
  const g = new THREE.RingGeometry(1.18, 1.32, 36);
  g.rotateX(-Math.PI / 2);
  return g;
})();
const TANK_ACTIVE_INNER_HALO_GEO = (() => {
  const g = new THREE.RingGeometry(7.72, 8.12, 48);
  g.rotateX(-Math.PI / 2);
  return g;
})();

/**
 * Generates a crisp high-DPI `CanvasTexture` numeric `mm` scale rail strip
 * aligned 1:1 with the vertical elevation ruler (`0..150 mm` for small arms,
 * `0..1200 mm` for heavy tank & aero ordnance). Caller owns `.dispose()`.
 */
function createElevationRulerLabelTexture(
  isTankGallery: boolean,
  isDaylight: boolean,
  align: 'left' | 'right'
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const maxCm = isTankGallery ? 122.0 : 15.2;
  const stepMm = isTankGallery ? 200 : 20;
  const maxLabelMm = isTankGallery ? 1200 : 140;

  const textColor = isDaylight ? '#0f172a' : '#bae6fd';
  const tickColor = isDaylight ? '#0284c7' : '#38bdf8';
  const subColor = isDaylight ? '#475569' : '#64748b';

  ctx.font = '700 32px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = align === 'left' ? 'right' : 'left';

  for (let mm = 0; mm <= maxLabelMm; mm += stepMm) {
    const cm = mm / 10;
    const uY = 1 - cm / maxCm;
    const py = Math.max(24, Math.min(canvas.height - 22, uY * canvas.height));

    // Crisp calibration tick notch adjacent to the vertical stile
    ctx.strokeStyle = tickColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (align === 'left') {
      ctx.moveTo(canvas.width - 28, py);
      ctx.lineTo(canvas.width - 2, py);
    } else {
      ctx.moveTo(2, py);
      ctx.lineTo(28, py);
    }
    ctx.stroke();

    // High-contrast legibility backing pill for crisp readability against any studio backdrop
    const label = `${mm} mm`;
    const tx = align === 'left' ? canvas.width - 38 : 38;
    const textW = ctx.measureText(label).width;
    const pillX = align === 'left' ? tx - textW - 10 : tx - 8;
    ctx.fillStyle = isDaylight
      ? 'rgba(241, 245, 249, 0.82)'
      : 'rgba(6, 12, 24, 0.72)';
    ctx.fillRect(pillX, py - 19, textW + 18, 38);

    ctx.fillStyle = mm === 0 ? subColor : textColor;
    ctx.fillText(label, tx, py);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds the 1:1 CNC elevation backdrop ruler (`0 mm` to `150 mm` = `0` to `15.0` world units)
 * behind the 17-caliber small-arms lineup (`z = -2.35 cm`), with `10 mm` (`1 cm`) horizontal
 * hairlines and `50 mm` (`5 cm`) major datum rules.
 */
function buildElevationScaleBackdrop(): {
  minorGeo: THREE.BufferGeometry;
  majorGeo: THREE.BufferGeometry;
} {
  const minorVerts: number[] = [];
  const majorVerts: number[] = [];
  const xLeft = SMALL_ARMS_RULER_LEFT_X;
  const xRight = SMALL_ARMS_RULER_RIGHT_X;
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

/**
 * Builds the 1:1 Heavy Armor & Aero Ordnance elevation backdrop ruler (`0 mm` to `1,200 mm` = `0..120 cm`)
 * behind the 4 ordnance rounds (`30×173mm` GAU-8 through `125mm` DTC10-125 at `z = -12.0 cm`, spanning
 * `x ∈ [-48, +48]` cleanly around `lineupXCm ∈ [-36, +34]`), with `100 mm` minor hairlines,
 * `200 mm` major rules, and `50 mm` stile half-ticks.
 */
function buildTankElevationScaleBackdrop(): {
  minorGeo: THREE.BufferGeometry;
  majorGeo: THREE.BufferGeometry;
} {
  const minorVerts: number[] = [];
  const majorVerts: number[] = [];
  const xLeft = -48.0;
  const xRight = 48.0;
  const zPlane = -12.0;

  majorVerts.push(xLeft, 0, zPlane, xLeft, 122.0, zPlane);
  majorVerts.push(xRight, 0, zPlane, xRight, 122.0, zPlane);

  for (let dm = 0; dm <= 12; dm++) {
    const yCm = dm * 10;
    const isMajor = dm % 2 === 0;
    const target = isMajor ? majorVerts : minorVerts;
    target.push(xLeft, yCm, zPlane, xRight, yCm, zPlane);

    if (dm < 12) {
      const halfY = yCm + 5;
      minorVerts.push(xLeft, halfY, zPlane, xLeft + 2.4, halfY, zPlane);
      minorVerts.push(xRight - 2.4, halfY, zPlane, xRight, halfY, zPlane);
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
const TANK_BACKDROP_SCALE_GEOS = buildTankElevationScaleBackdrop();

interface SingleCartridgeSpecimenProps {
  caliber: CaliberProfile;
  cutaway: boolean;
  isActive: boolean;
  isDaylight: boolean;
  showEdges: boolean;
  onSelect: (caliber: CaliberProfile) => void;
}

const SingleCartridgeSpecimen: React.FC<SingleCartridgeSpecimenProps> =
  React.memo(
    ({ caliber, cutaway, isActive, isDaylight, showEdges, onSelect }) => {
    const spec = CARTRIDGE_LAB_SPECS[caliber];
    // NOTE: `getCartridgeLabMeshBundle` returns cached module-level singletons (`cutawayCache`)
    // and stage plinth/pedestal/backdrop geometries are module-level singletons — never `.dispose()` here.
    // All JSX materials are disposed automatically by R3F on unmount.
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
      const isTankRound = isTankOrdnanceProfile(caliber);
      const scaleSpan = isTankRound
        ? caseH * 0.22
        : Math.max(0.75, caseH * 0.32);

      const isApfsds = spec.coreKind === 'apfsds_sabot_dart';
      if (primerRef.current) {
        primerRef.current.position.y =
          -t * ((isTankRound ? 3.2 : 0.95) + scaleSpan * 0.35);
      }
      if (anvilRef.current) {
        anvilRef.current.position.y =
          -t * ((isTankRound ? 1.6 : 0.48) + scaleSpan * 0.18);
      }
      if (propellantRef.current) {
        propellantRef.current.position.y = t * scaleSpan * 0.42;
      }
      if (jacketRef.current) {
        jacketRef.current.position.y = t * scaleSpan * (isApfsds ? 1.28 : 1.15);
      }
      if (coreSlugRef.current) {
        coreSlugRef.current.position.y =
          t * scaleSpan * (isApfsds ? 2.02 : 1.72);
      }
      if (penetratorRef.current) {
        penetratorRef.current.position.y =
          t * scaleSpan * (isApfsds ? 2.45 : 2.28);
      }
      if (haloRef.current && isActive) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.0045);
        haloRef.current.scale.setScalar(0.985 + 0.03 * pulse);
      }

      // Zero-GC in-place emissive layer highlight driven by external anatomy store
      const hl = isActive ? cartridgeHighlightLayer : null;
      const hlPulse = hl
        ? 0.58 + 0.34 * (0.5 + 0.5 * Math.sin(performance.now() * 0.006))
        : 0;
      const hlCore = hl === 'core';
      const hlProp = hl === 'propellant';
      const hlPrim = hl === 'primer';

      applyLayerHighlightInPlace(
        jacketRef.current,
        hlCore,
        LAYER_EMISSIVE_CORE,
        hlPulse * 0.55
      );
      applyLayerHighlightInPlace(
        coreSlugRef.current,
        hlCore,
        LAYER_EMISSIVE_CORE,
        hlPulse
      );
      applyLayerHighlightInPlace(
        penetratorRef.current,
        hlCore,
        LAYER_EMISSIVE_CORE,
        hlPulse * 1.15
      );
      applyLayerHighlightInPlace(
        propellantRef.current,
        hlProp,
        LAYER_EMISSIVE_PROPELLANT,
        hlPulse * 1.1
      );
      applyLayerHighlightInPlace(
        primerRef.current,
        hlPrim,
        LAYER_EMISSIVE_PRIMER,
        hlPulse
      );
      applyLayerHighlightInPlace(
        anvilRef.current,
        hlPrim,
        LAYER_EMISSIVE_PRIMER,
        hlPulse * 1.1
      );
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

    const isTankRound = isTankOrdnanceProfile(caliber);
    const isApfsds = spec.coreKind === 'apfsds_sabot_dart';

    return (
      <group
        position={[spec.lineupXCm, 0, 0]}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        {/* Datum Pedestal Disc */}
        <mesh
          geometry={isTankRound ? TANK_PEDESTAL_DISC_GEO : PEDESTAL_DISC_GEO}
          position={[0, isTankRound ? -0.4 : -0.08, 0]}
          receiveShadow
        >
          <meshStandardMaterial
            color={
              isDaylight
                ? isActive
                  ? '#cbd5e1'
                  : '#e2e8f0'
                : isActive
                  ? '#1e293b'
                  : '#0f172a'
            }
            metalness={isDaylight ? 0.35 : 0.72}
            roughness={isDaylight ? 0.48 : 0.34}
            emissive={isActive ? '#0284c7' : '#000000'}
            emissiveIntensity={isActive ? (isDaylight ? 0.14 : 0.22) : 0}
          />
        </mesh>

        {/* Crisp Dual-Ring Luminous Cyan Plinth Halo (zero emissive wash on brass/steel specimen!) */}
        {isActive && (
          <group position={[0, isTankRound ? 0.08 : 0.015, 0]}>
            <mesh
              ref={haloRef}
              geometry={isTankRound ? TANK_ACTIVE_HALO_GEO : ACTIVE_HALO_GEO}
              renderOrder={12}
            >
              <meshBasicMaterial
                color="#38bdf8"
                transparent
                opacity={0.92}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh
              geometry={
                isTankRound
                  ? TANK_ACTIVE_INNER_HALO_GEO
                  : ACTIVE_INNER_HALO_GEO
              }
              position={[0, 0.01, 0]}
              renderOrder={13}
            >
              <meshBasicMaterial
                color="#e0f2fe"
                transparent
                opacity={0.85}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        )}

        {/* 1. Drawn Brass / Polymer Hull / Combustible HITP Block / Tank Semi-Combustible Case */}
        <mesh geometry={bundle.caseGeo} castShadow receiveShadow>
          <meshPhysicalMaterial
            color={spec.caseColor}
            metalness={
              spec.coreKind === 'caseless_telescoped'
                ? 0.08
                : spec.coreKind === 'buckshot_wad_column'
                  ? 0.16
                  : isApfsds
                    ? 0.22
                    : 0.9
            }
            roughness={
              spec.coreKind === 'caseless_telescoped'
                ? 0.72
                : spec.coreKind === 'buckshot_wad_column'
                  ? 0.42
                  : isApfsds
                    ? 0.56
                    : 0.22
            }
            clearcoat={spec.coreKind === 'caseless_telescoped' ? 0.04 : 0.18}
            clearcoatRoughness={0.2}
          />
          {showEdges && (
            <Edges threshold={42} lineWidth={0.75} color="#78350f" />
          )}
        </mesh>

        {/* 2. Nickel-Plated Boxer Primer Cup / Axial Electric Ignition Tube */}
        <mesh ref={primerRef} geometry={bundle.primerCupGeo} castShadow>
          <meshPhysicalMaterial
            color="#e2e8f0"
            metalness={0.94}
            roughness={0.18}
            clearcoat={0.15}
          />
        </mesh>

        {/* 3. Brass Boxer Anvil / Electric Squib Core */}
        <mesh ref={anvilRef} geometry={bundle.anvilGeo}>
          <meshStandardMaterial
            color="#f59e0b"
            metalness={0.85}
            roughness={0.28}
          />
        </mesh>

        {/* 4. Granular Smokeless Propellant / Bundled Cylindrical Combustible Sticks */}
        <mesh ref={propellantRef} geometry={bundle.propellantGeo}>
          <meshStandardMaterial
            color={isApfsds ? '#2d343d' : spec.propellantColor}
            metalness={isApfsds ? 0.12 : 0.08}
            roughness={isApfsds ? 0.8 : 0.88}
          />
        </mesh>

        {/* 5. Gilding-Metal Jacket / Sub-Caliber Finned Tungsten Long-Rod Dart (APFSDS) */}
        <mesh ref={jacketRef} geometry={bundle.jacketGeo} castShadow>
          <meshPhysicalMaterial
            color={isApfsds ? '#475569' : spec.jacketColor}
            metalness={0.92}
            roughness={isApfsds ? 0.22 : 0.21}
            clearcoat={0.16}
            clearcoatRoughness={0.18}
          />
          {showEdges && (
            <Edges threshold={42} lineWidth={0.75} color="#7c2d12" />
          )}
        </mesh>

        {/* 6. Rear Core Slug / 3-Petal Grooved Aerospace Aluminum Saddle Sabot (APFSDS) */}
        <mesh ref={coreSlugRef} geometry={bundle.coreSlugGeo} castShadow>
          <meshPhysicalMaterial
            color={isApfsds ? '#d4dee9' : spec.coreSlugColor}
            metalness={isApfsds ? 0.88 : 0.76}
            roughness={isApfsds ? 0.22 : 0.42}
            clearcoat={isApfsds ? 0.18 : 0.04}
          />
        </mesh>

        {/* 7. Forward Hardened Steel Penetrator Tip / Copper Obturator & Ballistic Cap (APFSDS) */}
        {bundle.penetratorGeo && (
          <mesh ref={penetratorRef} geometry={bundle.penetratorGeo}>
            <meshPhysicalMaterial
              color={isApfsds ? '#e08e36' : spec.penetratorColor}
              metalness={isApfsds ? 0.9 : 0.95}
              roughness={isApfsds ? 0.22 : 0.16}
              clearcoat={0.2}
            />
          </mesh>
        )}
      </group>
    );
  });

SingleCartridgeSpecimen.displayName = 'SingleCartridgeSpecimen';

/**
 * WP-06 — 1:1 SAAMI / CIP Cartridge & Heavy Ordnance Cutaway Lab Stage
 * ---------------------------------------------------------------------
 * Displays all 17 small-arms calibers (`9×19mm` through `.50 BMG`) and the 4 heavy
 * ordnance rounds (`30×173mm` GAU-8, `88mm`, `120mm`, `125mm`) side-by-side at exact
 * `1:1` physical scale (`1 world unit = 1 cm = 10 mm`) with longitudinal `180°` cutaway
 * anatomy and CNC elevation ruler backdrops.
 */
export const CartridgeCutawayStage: React.FC = () => {
  const { size } = useThree();
  const stageGroupRef = useRef<THREE.Group>(null);
  const initializedOffsetRef = useRef(false);
  const animOffsetRef = useRef<StageOffsetVec>({ x: 0, y: 0, z: 0 });

  const screen = useAppStore((s) => s.screen);
  const activeCaliber = useAppStore((s) => s.activeCartridgeCaliber);
  const lineupOverview = useAppStore((s) => s.cartridgeLineupOverview);
  const cutaway = useAppStore((s) => s.cartridgeSectionCut);
  const showEdges = useAppStore((s) => s.showEdges);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const selectLabCartridge = useAppStore((s) => s.selectLabCartridge);

  const handleSelectCartridge = useCallback(
    (cal: CaliberProfile) => {
      selectLabCartridge(cal, true);
    },
    [selectLabCartridge]
  );

  // Reset hover pointer cursor & anatomy highlight cleanly on unmount
  useEffect(() => {
    return () => {
      setCartridgeHighlightLayer(null);
      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'auto';
      }
    };
  }, []);

  useFrame((_, delta) => {
    const grp = stageGroupRef.current;
    if (!grp) return;
    const st = useAppStore.getState();
    if (st.screen !== 'cartridges') {
      initializedOffsetRef.current = false;
      return;
    }

    const goal = computeCartridgeStageOffsetInto(
      size.width,
      size.height,
      st.cartridgeLineupOverview,
      st.activeCartridgeCaliber,
      cartridgeDossierCollapsed,
      st.hudHidden,
      st.cartridgeExplodeProgress
    );

    if (!initializedOffsetRef.current) {
      animOffsetRef.current.x = goal.x;
      animOffsetRef.current.y = goal.y;
      animOffsetRef.current.z = goal.z;
      initializedOffsetRef.current = true;
    } else {
      const dt = Math.min(delta, 0.05);
      animOffsetRef.current.x = THREE.MathUtils.damp(
        animOffsetRef.current.x,
        goal.x,
        8.5,
        dt
      );
      animOffsetRef.current.y = THREE.MathUtils.damp(
        animOffsetRef.current.y,
        goal.y,
        8.5,
        dt
      );
      animOffsetRef.current.z = THREE.MathUtils.damp(
        animOffsetRef.current.z,
        goal.z,
        8.5,
        dt
      );
    }

    grp.position.set(
      animOffsetRef.current.x,
      CARTRIDGE_STAGE_DATUM_Y + animOffsetRef.current.y,
      animOffsetRef.current.z
    );
  });

  const isDaylight = environmentPreset === 'blueprint_daylight';
  const isTankGallery = isTankOrdnanceProfile(activeCaliber);

  // High-DPI numeric `mm` ruler rail textures for left & right elevation stiles (properly disposed!)
  const leftRulerTex = useMemo(
    () =>
      screen === 'cartridges'
        ? createElevationRulerLabelTexture(isTankGallery, isDaylight, 'left')
        : null,
    [screen, isTankGallery, isDaylight]
  );
  const rightRulerTex = useMemo(
    () =>
      screen === 'cartridges'
        ? createElevationRulerLabelTexture(isTankGallery, isDaylight, 'right')
        : null,
    [screen, isTankGallery, isDaylight]
  );

  useEffect(() => {
    return () => {
      leftRulerTex?.dispose();
    };
  }, [leftRulerTex]);

  useEffect(() => {
    return () => {
      rightRulerTex?.dispose();
    };
  }, [rightRulerTex]);

  if (screen !== 'cartridges') return null;

  const activeOrder = isTankGallery ? TANK_ORDNANCE_ORDER : CARTRIDGE_LAB_ORDER;
  const backdropGeos = isTankGallery
    ? TANK_BACKDROP_SCALE_GEOS
    : BACKDROP_SCALE_GEOS;
  const initGoal = computeCartridgeStageOffsetInto(
    size.width,
    size.height,
    lineupOverview,
    activeCaliber,
    cartridgeDossierCollapsed,
    useAppStore.getState().hudHidden,
    useAppStore.getState().cartridgeExplodeProgress
  );

  const rulerH = isTankGallery ? 122.0 : 15.2;
  const rulerW = isTankGallery ? 16.5 : 3.2;
  const rulerZ = isTankGallery ? -11.92 : -2.32;
  const leftRailX = isTankGallery
    ? -48.0 - rulerW * 0.5
    : SMALL_ARMS_RULER_LEFT_X - rulerW * 0.5;
  const rightRailX = isTankGallery
    ? 48.0 + rulerW * 0.5
    : SMALL_ARMS_RULER_RIGHT_X + rulerW * 0.5;

  return (
    <group
      ref={stageGroupRef}
      position={[
        initGoal.x,
        CARTRIDGE_STAGE_DATUM_Y + initGoal.y,
        initGoal.z,
      ]}
    >
      {/* Machined CNC Datum Exhibition Plinth */}
      <mesh
        geometry={isTankGallery ? TANK_PLINTH_GEO : PLINTH_GEO}
        position={isTankGallery ? [0, -1.8, -1.5] : [0.85, -0.52, -0.2]}
        receiveShadow
      >
        <meshStandardMaterial
          color={isDaylight ? '#cbd5e1' : '#0b1120'}
          metalness={isDaylight ? 0.25 : 0.68}
          roughness={isDaylight ? 0.58 : 0.36}
        />
      </mesh>

      {/* 1:1 Elevation Scale Grid Backdrop (0–150 mm Small Arms / 0–1,200 mm Heavy Tank Ordnance) */}
      <lineSegments geometry={backdropGeos.minorGeo}>
        <lineBasicMaterial
          color={isDaylight ? '#64748b' : '#334155'}
          transparent
          opacity={0.42}
        />
      </lineSegments>
      <lineSegments geometry={backdropGeos.majorGeo}>
        <lineBasicMaterial
          color={isDaylight ? '#0284c7' : '#38bdf8'}
          transparent
          opacity={0.62}
        />
      </lineSegments>

      {/* High-DPI Numeric mm Calibration Labels on Left & Right Elevation Stiles */}
      {leftRulerTex && (
        <mesh position={[leftRailX, rulerH * 0.5, rulerZ]}>
          <planeGeometry args={[rulerW, rulerH]} />
          <meshBasicMaterial
            map={leftRulerTex}
            transparent
            depthWrite={false}
          />
        </mesh>
      )}
      {rightRulerTex && (
        <mesh position={[rightRailX, rulerH * 0.5, rulerZ]}>
          <planeGeometry args={[rulerW, rulerH]} />
          <meshBasicMaterial
            map={rightRulerTex}
            transparent
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Side-by-Side 1:1 Cutaway Specimens */}
      {activeOrder.map((caliber) => (
        <SingleCartridgeSpecimen
          key={caliber}
          caliber={caliber}
          cutaway={cutaway}
          isActive={caliber === activeCaliber}
          isDaylight={isDaylight}
          showEdges={showEdges}
          onSelect={handleSelectCartridge}
        />
      ))}
    </group>
  );
};

CartridgeCutawayStage.displayName = 'CartridgeCutawayStage';
