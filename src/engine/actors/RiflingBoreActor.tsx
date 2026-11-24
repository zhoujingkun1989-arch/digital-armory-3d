import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import type { WeaponId } from '../../weapons/types';
import {
  computeRiflingBoreBounds,
  getRiflingTextureSignatureKey,
  getWeaponRiflingSpec,
  type WeaponRiflingSpec,
} from '../ballistics/riflingSpecs';
import { playbackClock } from '../clock/playbackClock';
import { lockLinearTextureColorSpace } from '../materials/pbrManager';
import { getArmoryPhysicsState } from '../physics/armoryPhysics';
import {
  SECTION_CUT_PLANES,
  type SectionCutAxis,
} from './StencilSectionCap';

// ============================================================================
// Digital Armory 3D — Zero-GC Cutaway Helical Barrel Rifling & Chamber Throat
// ----------------------------------------------------------------------------
// Renders a concave half-cylinder bore interior liner + chamfered chamber
// throat/leade cone strictly inside longitudinal Z CT cutaway (`[C]`), revealing
// cut vs polygonal helical lands/grooves or hard-chrome smoothbore honing plus
// real-time firing burst heat-tint & carbon fouling buildup.
// ============================================================================

export const RIFLING_EXPLODE_VISIBILITY_MAX = 0.04;
const HALF_CYL_EDGE_INSET_RAD = 0.03;
const HALF_CYL_THETA_START = Math.PI * 0.5 + HALF_CYL_EDGE_INSET_RAD;
const HALF_CYL_THETA_LEN = Math.PI - HALF_CYL_EDGE_INSET_RAD * 2;
const TEXTURE_SIZE = 256;

const noRiflingRaycast = () => null;

// Pre-allocated Zero-GC color scratch objects shared by useFrame
const _chromeBaseColor = new THREE.Color('#dde5ee');
const _steelBaseColor = new THREE.Color('#9ea8b4');
const _fouledBoreColor = new THREE.Color('#3c3936');
const _throatCopperBase = new THREE.Color('#b88966');
const _throatChromeBase = new THREE.Color('#c8ccd2');
const _throatFouledColor = new THREE.Color('#342d28');
const _throatEmissiveHot = new THREE.Color('#ff6a1a');
const _boreEmissiveHot = new THREE.Color('#d9480f');
const _boreNormalScale = new THREE.Vector2(1.35, 1.35);

export interface RiflingVisibilityQuery {
  sectionCut: boolean;
  sectionCutAxis: SectionCutAxis;
  sectionCutOffset: number;
  sectionCutFlip: boolean;
  explodeProgress: number;
  boreRadiusCm: number;
}

/**
 * Pure visibility predicate for the cutaway rifling liner:
 * visible strictly when Longitudinal Z CT Cutaway is active, assembly is closed
 * (`explodeProgress < 0.04`), and the live Z slice plane intersects the bore cavity.
 */
export function shouldShowRiflingBore(q: RiflingVisibilityQuery): boolean {
  if (
    !q.sectionCut ||
    q.sectionCutAxis !== 'z' ||
    q.explodeProgress >= RIFLING_EXPLODE_VISIBILITY_MAX
  ) {
    return false;
  }
  const margin = q.boreRadiusCm * 0.92;
  return q.sectionCutFlip
    ? q.sectionCutOffset < margin
    : q.sectionCutOffset > -margin;
}

export interface RiflingTextureSuite {
  key: string;
  albedoMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

interface CachedTextureEntry {
  suite: RiflingTextureSuite;
  refs: number;
}

const riflingTextureCache = new Map<string, CachedTextureEntry>();

function clampByte(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

/**
 * Synthesizes cached 256×256 procedural PBR rifling maps (albedo + analytical
 * tangent-space normal + roughness) per `(kind, grooves, direction, chromeLined)`.
 * Every non-sRGB texture (`normalMap`, `roughnessMap`) passes through
 * `lockLinearTextureColorSpace()` to honor R3F v8 linear color-space invariants.
 */
function buildRiflingTextureSuite(
  spec: Readonly<WeaponRiflingSpec>
): RiflingTextureSuite | null {
  if (typeof document === 'undefined') return null;

  const key = getRiflingTextureSignatureKey(spec);
  const w = TEXTURE_SIZE;
  const h = TEXTURE_SIZE;

  const albedoCanvas = document.createElement('canvas');
  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  albedoCanvas.width = normalCanvas.width = roughCanvas.width = w;
  albedoCanvas.height = normalCanvas.height = roughCanvas.height = h;

  const aCtx = albedoCanvas.getContext('2d');
  const nCtx = normalCanvas.getContext('2d');
  const rCtx = roughCanvas.getContext('2d');
  if (!aCtx || !nCtx || !rCtx) return null;

  const aImg = aCtx.createImageData(w, h);
  const nImg = nCtx.createImageData(w, h);
  const rImg = rCtx.createImageData(w, h);
  const aData = aImg.data;
  const nData = nImg.data;
  const rData = rImg.data;

  const heightField = new Float32Array(w * h);
  const grooves = Math.max(0, spec.grooves);
  const halfGrooves = grooves * 0.5;
  const dirSign = spec.direction === 'LH' ? -1 : 1;
  const isPolygonal = spec.kind === 'polygonal';
  const isSmoothbore = spec.kind === 'smoothbore' || grooves === 0;
  const isChrome = spec.chromeLined;

  // Pass 1: evaluate exact seamless helical land/groove or plateau-honing heightfield
  for (let py = 0; py < h; py++) {
    // flipY=true maps py=0 -> v=1 (muzzle), py=h-1 -> v=0 (chamber)
    const v = 1 - py / h;
    for (let px = 0; px < w; px++) {
      const u = px / w;
      const idx = py * w + px;

      // Fine deterministic lapping/machining micro-grain
      const microHash = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453;
      const grain = (microHash - Math.floor(microHash) - 0.5) * 0.04;

      if (isSmoothbore) {
        // Mirror-honed hard-chrome bore with authentic ±22° rotary plateau crosshatch
        const h1 = Math.sin((u * 18 + v * 46) * Math.PI * 2);
        const h2 = Math.sin((u * 18 - v * 46) * Math.PI * 2);
        heightField[idx] = 0.52 + 0.06 * (h1 + h2) + grain * 0.6;
      } else {
        // Seamless vertical periodicity: phase advances by exact integer `grooves` per tile
        const rawPhase = u * halfGrooves + dirSign * v * grooves;
        const frac = rawPhase - Math.floor(rawPhase); // [0..1) within one land+groove period

        if (isPolygonal) {
          // Smooth undulating hexagonal/polygonal flats & rounded crests (no sharp cut walls)
          const wave = 0.5 + 0.5 * Math.cos(frac * Math.PI * 2);
          const smoothProfile = Math.pow(wave, 1.35);
          heightField[idx] = 0.16 + 0.72 * smoothProfile + grain * 0.5;
        } else {
          // Crisp cut/button/CHF rectangular lands (46%) & recessed grooves (54%) with beveled shoulders
          const landFrac = grooves >= 16 ? 0.48 : 0.44;
          const bevel = grooves >= 16 ? 0.065 : 0.045;
          let profile: number;
          if (frac < bevel) {
            profile = frac / bevel;
          } else if (frac < landFrac - bevel) {
            profile = 1.0;
          } else if (frac < landFrac) {
            profile = (landFrac - frac) / bevel;
          } else {
            profile = 0.0;
          }
          // Subtle longitudinal cutter tool-marks along groove floor
          const toolLine = Math.sin(frac * Math.PI * 10) * 0.03 * (1 - profile);
          heightField[idx] = 0.08 + 0.86 * profile + toolLine + grain;
        }
      }
    }
  }

  // Pass 2: encode albedo (chrome/steel + subtle driving-edge copper trace), analytical normal & roughness
  const normalStrength = isSmoothbore ? 1.8 : isPolygonal ? 4.2 : 6.8;

  for (let py = 0; py < h; py++) {
    const pyUp = (py - 1 + h) % h;
    const pyDn = (py + 1) % h;
    for (let px = 0; px < w; px++) {
      const pxL = px > 0 ? px - 1 : 0;
      const pxR = px < w - 1 ? px + 1 : w - 1;
      const idx = py * w + px;
      const hVal = heightField[idx];

      // Central-difference height gradient for tangent-space normal
      const dhdu = (heightField[py * w + pxR] - heightField[py * w + pxL]) * 0.5;
      const dhdv = (heightField[pyUp * w + px] - heightField[pyDn * w + px]) * 0.5;
      let nx = -dhdu * normalStrength;
      let ny = -dhdv * normalStrength;
      let nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      // Subtle copper gilding-metal smear along high-slope driving edges on rifled barrels
      const edgeSlope = isSmoothbore ? 0 : Math.min(1, Math.hypot(dhdu, dhdv) * 4.8);
      const copperMix = edgeSlope * (isPolygonal ? 0.18 : 0.28);

      // Crisp land-crest vs recessed-groove contrast so helical rifling reads unmistakably
      // under both Dark Studio and sunlit Blueprint Daylight inside the sliced steel barrel
      const baseLum = isChrome
        ? 136 + hVal * 112
        : 86 + hVal * 122;
      const rCol = baseLum * (1 - copperMix) + 206 * copperMix;
      const gCol = baseLum * (1 - copperMix) + 134 * copperMix;
      const bCol = (baseLum + (isChrome ? 10 : 4)) * (1 - copperMix) + 76 * copperMix;

      // Polished chrome lands / smoothbore (~0.14-0.20) vs matte groove floors (~0.40-0.52)
      const rough01 = isSmoothbore
        ? 0.14 + (1 - hVal) * 0.08
        : isChrome
          ? 0.15 + (1 - hVal) * 0.28
          : 0.20 + (1 - hVal) * 0.32;
      const roughByte = clampByte(rough01 * 255);

      const o = idx * 4;
      aData[o] = clampByte(rCol);
      aData[o + 1] = clampByte(gCol);
      aData[o + 2] = clampByte(bCol);
      aData[o + 3] = 255;

      nData[o] = clampByte((nx * 0.5 + 0.5) * 255);
      nData[o + 1] = clampByte((ny * 0.5 + 0.5) * 255);
      nData[o + 2] = clampByte((nz * 0.5 + 0.5) * 255);
      nData[o + 3] = 255;

      rData[o] = roughByte;
      rData[o + 1] = roughByte;
      rData[o + 2] = roughByte;
      rData[o + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const albedoMap = new THREE.CanvasTexture(albedoCanvas);
  albedoMap.colorSpace = THREE.SRGBColorSpace;
  albedoMap.wrapS = THREE.ClampToEdgeWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.anisotropy = 4;
  albedoMap.needsUpdate = true;

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  lockLinearTextureColorSpace(normalMap);
  normalMap.wrapS = THREE.ClampToEdgeWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.anisotropy = 4;
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  lockLinearTextureColorSpace(roughnessMap);
  roughnessMap.wrapS = THREE.ClampToEdgeWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = 4;
  roughnessMap.needsUpdate = true;

  return { key, albedoMap, normalMap, roughnessMap };
}

function acquireRiflingTextureSuite(
  spec: Readonly<WeaponRiflingSpec>
): RiflingTextureSuite | null {
  const key = getRiflingTextureSignatureKey(spec);
  const existing = riflingTextureCache.get(key);
  if (existing) {
    existing.refs += 1;
    return existing.suite;
  }
  const suite = buildRiflingTextureSuite(spec);
  if (!suite) return null;
  riflingTextureCache.set(key, { suite, refs: 1 });
  return suite;
}

function releaseRiflingTextureSuite(key: string): void {
  const entry = riflingTextureCache.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    entry.suite.albedoMap.dispose();
    entry.suite.normalMap.dispose();
    entry.suite.roughnessMap.dispose();
    riflingTextureCache.delete(key);
  }
}

export interface RiflingBoreActorProps {
  /** Explicit weapon override for Split 3D Pane A / Pane B; defaults to active Workbench exhibit. */
  weaponIdOverride?: WeaponId;
  /** Disables live Workbench thermal coupling for secondary comparison panes unless matching. */
  isSplitView?: boolean;
}

/**
 * Zero-GC 3D cutaway concave helical rifling bore liner & chamfered chamber throat.
 * Automatically mounts inside `<WeaponRecoilGroup>` in Workbench and inside both
 * Split 3D Showdown side portals, flipping cleanly when `sectionCutFlip` reverses.
 */
export const RiflingBoreActor: React.FC<RiflingBoreActorProps> = ({
  weaponIdOverride,
  isSplitView = false,
}) => {
  const storeWeaponId = useAppStore((s) => s.activeWeaponId);
  const weaponId = weaponIdOverride ?? storeWeaponId;
  const spec = getWeaponRiflingSpec(weaponId);
  const bounds = useMemo(() => computeRiflingBoreBounds(weaponId), [weaponId]);

  const groupRef = useRef<THREE.Group>(null);
  const boreMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const throatMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  const geometries = useMemo(() => {
    if (!bounds) return null;
    const radialSegments = spec.grooves >= 16 ? 40 : 28;

    // Concave half-cylinder sitting strictly in z <= 0 (with BackSide interior facing +Z open cut)
    const boreGeo = new THREE.CylinderGeometry(
      bounds.boreRadiusCm,
      bounds.boreRadiusCm,
      bounds.lengthCm,
      radialSegments,
      1,
      true,
      HALF_CYL_THETA_START,
      HALF_CYL_THETA_LEN
    );
    boreGeo.rotateZ(-Math.PI / 2);

    // Bake per-exhibit helical twist / honing repeat directly into geometry UV.y so
    // cached PBR CanvasTextures stay immutable across simultaneous Split 3D panes.
    const repeatY =
      spec.kind === 'smoothbore'
        ? Math.max(1.5, bounds.lengthCm / Math.max(0.4, bounds.boreRadiusCm * 4))
        : Math.max(0.6, bounds.turnsAlongBore);
    const uvAttr = boreGeo.getAttribute('uv');
    if (uvAttr) {
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setY(i, uvAttr.getY(i) * repeatY);
      }
      uvAttr.needsUpdate = true;
    }

    // Chamfered chamber throat / leade / forcing-cone half-frustum right behind `startX`
    // CylinderGeometry(radiusTop=+X=boreRadius, radiusBottom=-X=throatRadius) after rotateZ(-PI/2)
    const throatGeo = new THREE.CylinderGeometry(
      bounds.boreRadiusCm,
      bounds.throatRadiusCm,
      bounds.throatLengthCm,
      radialSegments,
      1,
      true,
      HALF_CYL_THETA_START,
      HALF_CYL_THETA_LEN
    );
    throatGeo.rotateZ(-Math.PI / 2);

    return { boreGeo, throatGeo };
  }, [bounds, spec.grooves, spec.kind]);

  useEffect(() => {
    if (!geometries) return;
    return () => {
      geometries.boreGeo.dispose();
      geometries.throatGeo.dispose();
    };
  }, [geometries]);

  // Acquire & attach ref-counted cached procedural PBR maps; release cleanly on change/unmount
  useEffect(() => {
    if (!bounds) return;
    const boreMat = boreMatRef.current;
    if (!boreMat) return;

    const suite = acquireRiflingTextureSuite(spec);
    if (suite) {
      boreMat.map = suite.albedoMap;
      boreMat.normalMap = suite.normalMap;
      boreMat.roughnessMap = suite.roughnessMap;
      boreMat.needsUpdate = true;
    }

    return () => {
      boreMat.map = null;
      boreMat.normalMap = null;
      boreMat.roughnessMap = null;
      boreMat.needsUpdate = true;
      if (suite) {
        releaseRiflingTextureSuite(suite.key);
      }
    };
  }, [bounds, spec]);

  // Zero-GC 60Hz visibility, flip orientation & firing thermal/fouling modulation
  useFrame(() => {
    const grp = groupRef.current;
    if (!grp || !bounds) return;

    const st = useAppStore.getState();
    const explodeT = playbackClock.getState().animatedProgress;
    const visible = shouldShowRiflingBore({
      sectionCut: st.sectionCut,
      sectionCutAxis: st.sectionCutAxis,
      sectionCutOffset: st.sectionCutOffset,
      sectionCutFlip: st.sectionCutFlip,
      explodeProgress: explodeT,
      boreRadiusCm: bounds.boreRadiusCm,
    });

    grp.visible = visible;
    if (!visible) return;

    // Rigid 180° X rotation flips concave trough into z >= 0 facing -Z while preserving RH/LH chirality
    grp.rotation.x = st.sectionCutFlip ? Math.PI : 0;

    // Subtle real-time throat heat-tint & carbon-fouling darkening during firing bursts
    const boreMat = boreMatRef.current;
    const throatMat = throatMatRef.current;
    if (!boreMat || !throatMat) return;

    const phys = getArmoryPhysicsState();
    const applyLiveThermal =
      !isSplitView && (phys.weaponId === null || phys.weaponId === weaponId);
    const heat = applyLiveThermal ? phys.barrelHeat01 : 0;
    const fouling = applyLiveThermal ? phys.carbonFouling01 : 0;

    const boreBase = spec.chromeLined ? _chromeBaseColor : _steelBaseColor;
    boreMat.color.copy(boreBase).lerp(_fouledBoreColor, fouling * 0.42);
    if (heat > 0.08) {
      const hGlow = Math.min(1, (heat - 0.08) / 0.92);
      boreMat.emissive.copy(_boreEmissiveHot);
      boreMat.emissiveIntensity = hGlow * hGlow * 0.45;
    } else {
      boreMat.emissiveIntensity = 0;
    }

    const throatBase = spec.chromeLined ? _throatChromeBase : _throatCopperBase;
    throatMat.color.copy(throatBase).lerp(_throatFouledColor, fouling * 0.56);
    if (heat > 0.05) {
      const thGlow = Math.min(1, (heat - 0.05) / 0.95);
      throatMat.emissive.copy(_throatEmissiveHot);
      throatMat.emissiveIntensity = thGlow * thGlow * 0.85;
    } else {
      throatMat.emissiveIntensity = 0;
    }
  });

  if (!bounds || !geometries) {
    return null;
  }

  const centerX = (bounds.startX + bounds.endX) * 0.5;
  const throatCenterX = bounds.startX - bounds.throatLengthCm * 0.5;

  return (
    <group
      ref={groupRef}
      name={`rifling-bore-${weaponId}`}
      position={[0, bounds.boreY, bounds.boreZ]}
      visible={false}
    >
      <mesh
        geometry={geometries.boreGeo}
        position={[centerX, 0, 0]}
        renderOrder={2}
        raycast={noRiflingRaycast}
      >
        <meshStandardMaterial
          ref={boreMatRef}
          color={spec.chromeLined ? '#dde5ee' : '#9ea8b4'}
          metalness={spec.chromeLined ? 0.92 : 0.86}
          roughness={spec.chromeLined ? 0.22 : 0.30}
          envMapIntensity={spec.chromeLined ? 1.85 : 1.55}
          side={THREE.BackSide}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
          clippingPlanes={SECTION_CUT_PLANES}
          normalScale={_boreNormalScale}
          emissive="#000000"
          emissiveIntensity={0}
        />
      </mesh>
      <mesh
        geometry={geometries.throatGeo}
        position={[throatCenterX, 0, 0]}
        renderOrder={2}
        raycast={noRiflingRaycast}
      >
        <meshStandardMaterial
          ref={throatMatRef}
          color={spec.chromeLined ? '#c8ccd2' : '#b88966'}
          metalness={spec.chromeLined ? 0.88 : 0.84}
          roughness={spec.chromeLined ? 0.26 : 0.34}
          envMapIntensity={1.45}
          side={THREE.BackSide}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
          clippingPlanes={SECTION_CUT_PLANES}
          emissive="#000000"
          emissiveIntensity={0}
        />
      </mesh>
    </group>
  );
};
