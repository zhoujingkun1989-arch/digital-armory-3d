import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import type { WeaponId } from '../../weapons/types';
import { playbackClock } from '../clock/playbackClock';
import {
  DEFAULT_ARMORY_ENVIRONMENT,
  buildAzimuthDialMarks,
  canCreateCanvasTextures,
  createSeededRandom,
  getArmoryEnvironment,
  type ArmoryEnvironmentPreset,
} from '../canvas/GunsmithStageMat';
import {
  evaluateWeaponTurntableEnvelopeInto,
  getTurntableRadius,
} from '../canvas/turntableStageMetrics';

const noopRaycast: THREE.Object3D['raycast'] = () => {};

// =====================================================================================
// Pedestal dimensions (fractions of the dynamic platter radius R; heights in cm).
// The whole stage spans platterTopY (y = 0) → platterTopY - 0.6 = gridFloorY.
// =====================================================================================

export const TURNTABLE_PEDESTAL_PROFILE = {
  platterChamfer: 0.09,
  platterHeight: 0.3,
  grooveHeight: 0.04,
  totalHeight: 0.6,
  dialInner: 0.7,
  dialOuter: 0.965,
  insertRadius: 0.62,
  chassisFlare: 1.045,
} as const;

export interface TurntablePedestalGeometries {
  platter: THREE.LatheGeometry;
  chassis: THREE.LatheGeometry;
  accentGroove: THREE.CylinderGeometry;
  dial: THREE.RingGeometry;
  insert: THREE.CircleGeometry;
  statusRing: THREE.RingGeometry;
  indexNotch: THREE.BoxGeometry;
}

/** CNC-turned billet profiles: chamfered anodized platter + flared brushed-steel chassis. */
export function buildTurntablePedestalGeometries(
  radius: number
): TurntablePedestalGeometries {
  const P = TURNTABLE_PEDESTAL_PROFILE;
  const R = radius;
  const c = P.platterChamfer;

  const platter = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(R - c, 0),
      new THREE.Vector2(R - c * 0.3, -c * 0.12),
      new THREE.Vector2(R, -c),
      new THREE.Vector2(R, -P.platterHeight + 0.03),
      new THREE.Vector2(R - 0.03, -P.platterHeight),
      new THREE.Vector2(R * 0.97, -P.platterHeight),
    ],
    160
  );

  const top = -P.platterHeight - P.grooveHeight;
  const chassis = new THREE.LatheGeometry(
    [
      new THREE.Vector2(R * 0.97, top),
      new THREE.Vector2(R * 1.012, top),
      new THREE.Vector2(R * P.chassisFlare, top - 0.06),
      new THREE.Vector2(R * P.chassisFlare, -P.totalHeight + 0.05),
      new THREE.Vector2(R * P.chassisFlare - 0.05, -P.totalHeight),
      new THREE.Vector2(R * 0.5, -P.totalHeight),
    ],
    160
  );

  const accentGroove = new THREE.CylinderGeometry(
    R * 0.994,
    R * 0.994,
    P.grooveHeight + 0.006,
    160,
    1,
    true
  );
  accentGroove.translate(0, -P.platterHeight - P.grooveHeight / 2, 0);

  const dial = new THREE.RingGeometry(R * P.dialInner, R * P.dialOuter, 192, 1);
  dial.rotateX(-Math.PI / 2);
  dial.translate(0, 0.006, 0);

  const insert = new THREE.CircleGeometry(R * P.insertRadius, 128);
  insert.rotateX(-Math.PI / 2);
  insert.translate(0, 0.004, 0);

  const statusRing = new THREE.RingGeometry(
    R * (P.insertRadius + 0.012),
    R * (P.insertRadius + 0.026),
    160,
    1
  );
  statusRing.rotateX(-Math.PI / 2);
  statusRing.translate(0, 0.008, 0);

  // Amber 0° index notch on the platter rim, pointing at +X (muzzle datum)
  const indexNotch = new THREE.BoxGeometry(R * 0.05, 0.012, R * 0.014);
  indexNotch.translate(R * (P.dialOuter + 0.012), 0.008, 0);

  return {
    platter,
    chassis,
    accentGroove,
    dial,
    insert,
    statusRing,
    indexNotch,
  };
}

// =====================================================================================
// Laser-etched 360° azimuth vernier dial (procedural CanvasTexture)
// =====================================================================================

export interface DialInkColors {
  etch: string;
  etchMajor: string;
  accent: string;
}

/**
 * Paints the dial in RingGeometry planar-UV space: canvas centre = platter axis,
 * canvas edge = dial outer radius. 0° sits at canvas +x (world +X muzzle), 90° at canvas
 * top (world -Z, far side), increasing counter-clockwise when seen from above.
 */
export function paintAzimuthDial(
  ctx: CanvasRenderingContext2D,
  size: number,
  colors: DialInkColors
): void {
  const P = TURNTABLE_PEDESTAL_PROFILE;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2;
  const inner = (P.dialInner / P.dialOuter) * rOuter;
  const font = (frac: number, weight = 600) =>
    `${weight} ${Math.max(6, Math.round(size * frac))}px "JetBrains Mono", "SFMono-Regular", Menlo, monospace`;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.lineCap = 'butt';

  ctx.strokeStyle = colors.etch;
  ctx.lineWidth = Math.max(1, size * 0.0016);
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter * 0.992, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, inner * 1.012, 0, Math.PI * 2);
  ctx.stroke();

  const band = rOuter * 0.992 - inner * 1.012;
  for (const m of buildAzimuthDialMarks()) {
    const a = THREE.MathUtils.degToRad(m.deg);
    const ca = Math.cos(a);
    const sa = -Math.sin(a);
    const len =
      m.kind === 'cardinal'
        ? 0.46
        : m.kind === 'major'
          ? 0.36
          : m.kind === 'mid'
            ? 0.24
            : 0.15;
    const r0 = rOuter * 0.992;
    const r1 = r0 - band * len;
    ctx.strokeStyle =
      m.kind === 'cardinal'
        ? colors.accent
        : m.kind === 'minor'
          ? colors.etch
          : colors.etchMajor;
    ctx.lineWidth = Math.max(
      1,
      size * (m.kind === 'minor' ? 0.0014 : m.kind === 'mid' ? 0.002 : 0.003)
    );
    ctx.beginPath();
    ctx.moveTo(cx + ca * r0, cy + sa * r0);
    ctx.lineTo(cx + ca * r1, cy + sa * r1);
    ctx.stroke();

    if (m.label) {
      const rl = r0 - band * 0.66;
      ctx.save();
      ctx.translate(cx + ca * rl, cy + sa * rl);
      // Tangential numerals, baseline facing the platter centre
      ctx.rotate(-a + Math.PI / 2);
      ctx.fillStyle = m.kind === 'cardinal' ? colors.accent : colors.etchMajor;
      ctx.font = font(m.kind === 'cardinal' ? 0.028 : 0.024, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${m.label}°`, 0, 0);
      ctx.restore();
    }
  }

  // Fine 1° vernier sub-scale on the inner edge
  ctx.strokeStyle = colors.etch;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1, size * 0.0009);
  ctx.beginPath();
  for (let deg = 0; deg < 360; deg++) {
    if (deg % 5 === 0) continue;
    const a = THREE.MathUtils.degToRad(deg);
    const ca = Math.cos(a);
    const sa = -Math.sin(a);
    const r0 = inner * 1.012;
    const r1 = r0 + band * 0.07;
    ctx.moveTo(cx + ca * r0, cy + sa * r0);
    ctx.lineTo(cx + ca * r1, cy + sa * r1);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Datum caption on the near side (world +Z, canvas bottom)
  ctx.fillStyle = colors.etch;
  ctx.font = font(0.017, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AZIMUTH · 方位角  0° = +X MUZZLE', cx, cy + inner * 1.09);
  ctx.restore();
}

/** Concentric spun-finish (lathe-turned) roughness pattern for the steel centre insert. */
export function paintSpunFinish(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed = 0x5a17
): void {
  const rand = createSeededRandom(seed);
  ctx.fillStyle = 'rgb(118,118,118)';
  ctx.fillRect(0, 0, size, size);
  const c = size / 2;
  ctx.lineWidth = Math.max(1, size / 512);
  for (let r = 2; r < c; r += Math.max(1, size / 512)) {
    const v = Math.round(92 + rand() * 60);
    ctx.strokeStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export const AZIMUTH_DIAL_TEXTURE_SIZE = 2048;
const dialTextureCache = new Map<
  ArmoryEnvironmentPreset,
  THREE.CanvasTexture
>();
let spunTexture: THREE.CanvasTexture | null = null;

function makeCanvas(size: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null {
  if (!canCreateCanvasTextures()) return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  return ctx ? { canvas, ctx } : null;
}

export function getAzimuthDialTexture(
  preset: ArmoryEnvironmentPreset
): THREE.CanvasTexture | null {
  const cached = dialTextureCache.get(preset);
  if (cached) return cached;
  const c = makeCanvas(AZIMUTH_DIAL_TEXTURE_SIZE);
  if (!c) return null;
  const tt = getArmoryEnvironment(preset).turntable;
  paintAzimuthDial(c.ctx, AZIMUTH_DIAL_TEXTURE_SIZE, {
    etch: tt.etch,
    etchMajor: tt.etchMajor,
    accent: tt.accentAmber,
  });
  const tex = new THREE.CanvasTexture(c.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.name = `AzimuthDial.${preset}`;
  tex.needsUpdate = true;
  dialTextureCache.set(preset, tex);
  return tex;
}

function getSpunFinishTexture(): THREE.CanvasTexture | null {
  if (spunTexture) return spunTexture;
  const c = makeCanvas(1024);
  if (!c) return null;
  paintSpunFinish(c.ctx, 1024);
  spunTexture = new THREE.CanvasTexture(c.canvas);
  spunTexture.colorSpace = THREE.NoColorSpace;
  spunTexture.anisotropy = 8;
  spunTexture.name = 'Turntable.spunFinish';
  spunTexture.needsUpdate = true;
  return spunTexture;
}

// =====================================================================================
// Component
// =====================================================================================

export interface ExhibitionTurntableProps {
  weaponId: WeaponId;
  environmentPreset?: ArmoryEnvironmentPreset;
}

export const ExhibitionTurntable: React.FC<ExhibitionTurntableProps> =
  React.memo(({ weaponId, environmentPreset = DEFAULT_ARMORY_ENVIRONMENT }) => {
    const screen = useAppStore((s) => s.screen);
    const groupRef = useRef<THREE.Group>(null);

    const radius = getTurntableRadius(weaponId);
    const env = getArmoryEnvironment(environmentPreset);
    const tt = env.turntable;
    const isLight = env.tone === 'light';

    const geos = useMemo(
      () => buildTurntablePedestalGeometries(radius),
      [radius]
    );
    useEffect(
      () => () => {
        geos.platter.dispose();
        geos.chassis.dispose();
        geos.accentGroove.dispose();
        geos.dial.dispose();
        geos.insert.dispose();
        geos.statusRing.dispose();
        geos.indexNotch.dispose();
      },
      [geos]
    );

    // Module-cached procedural textures (shared, never disposed per unmount)
    const dialTex = useMemo(
      () => getAzimuthDialTexture(environmentPreset),
      [environmentPreset]
    );
    const spunTex = useMemo(() => getSpunFinishTexture(), []);

    useFrame(() => {
      if (!groupRef.current) return;
      const st = useAppStore.getState();
      if (st.screen === 'workbench') return;
      const envl = evaluateWeaponTurntableEnvelopeInto(
        st.activeWeaponId,
        playbackClock.getState().animatedProgress
      );
      groupRef.current.position.set(envl.cx, envl.platterTopY, 0);
    });

    if (screen === 'workbench') return null;

    const initialEnv = evaluateWeaponTurntableEnvelopeInto(weaponId, 0);

    return (
      <group
        ref={groupRef}
        position={[initialEnv.cx, initialEnv.platterTopY, 0]}
      >
        {/* Dark hard-coat anodized 6061 billet platter (receives the firearm's studio shadow) */}
        <mesh geometry={geos.platter} receiveShadow raycast={noopRaycast}>
          <meshPhysicalMaterial
            color={tt.platter}
            metalness={0.82}
            roughness={0.4}
            clearcoat={0.35}
            clearcoatRoughness={0.38}
            envMapIntensity={isLight ? 0.9 : 1.15}
          />
        </mesh>

        {/* Brushed ordnance-steel chassis with flared chamfered foot */}
        <mesh
          geometry={geos.chassis}
          receiveShadow
          castShadow
          raycast={noopRaycast}
        >
          <meshPhysicalMaterial
            color={tt.chassis}
            metalness={0.94}
            roughness={0.3}
            anisotropy={0.6}
            envMapIntensity={1.2}
          />
        </mesh>

        {/* Recessed cyan status groove between platter and chassis */}
        <mesh geometry={geos.accentGroove} raycast={noopRaycast}>
          <meshStandardMaterial
            color={tt.accentCyan}
            emissive={tt.accentCyan}
            emissiveIntensity={tt.accentEmissive}
            metalness={0.2}
            roughness={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Spun-finish stainless centre insert */}
        <mesh geometry={geos.insert} receiveShadow raycast={noopRaycast}>
          <meshStandardMaterial
            color={tt.insert}
            metalness={0.9}
            roughness={1}
            roughnessMap={spunTex}
            envMapIntensity={isLight ? 0.85 : 1.1}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>

        {/* Amber status ring around the insert */}
        <mesh geometry={geos.statusRing} raycast={noopRaycast}>
          <meshStandardMaterial
            color={tt.accentAmber}
            emissive={tt.accentAmber}
            emissiveIntensity={tt.accentEmissive * 0.7}
            metalness={0.3}
            roughness={0.35}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>

        {/* 360° laser-etched azimuth vernier dial */}
        {dialTex && (
          <mesh geometry={geos.dial} receiveShadow raycast={noopRaycast}>
            <meshStandardMaterial
              map={dialTex}
              emissiveMap={dialTex}
              emissive="#ffffff"
              emissiveIntensity={isLight ? 0.08 : 0.22}
              transparent
              depthWrite={false}
              metalness={0.55}
              roughness={0.32}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </mesh>
        )}

        {/* Amber 0° (+X muzzle) index notch */}
        <mesh geometry={geos.indexNotch} raycast={noopRaycast}>
          <meshStandardMaterial
            color={tt.accentAmber}
            emissive={tt.accentAmber}
            emissiveIntensity={tt.accentEmissive}
            metalness={0.4}
            roughness={0.3}
          />
        </mesh>
      </group>
    );
  });

ExhibitionTurntable.displayName = 'ExhibitionTurntable';
