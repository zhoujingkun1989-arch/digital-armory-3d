import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import {
  CaliberProfile,
  computeWeaponBallisticsState,
  getWeaponCaliberProfile,
  getWeaponWorkbenchMeta,
} from '../data/weaponRegistry';
import { csgSubtract, mergeParts } from '../geometry/springHelper';
import { useExplodeStore } from '../store/useExplodeStore';

function build9mmCaseGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.42, 0.43, 1.68, 22);
  body.rotateZ(Math.PI / 2);
  body.translate(0.08, 0, 0);

  const rim = new THREE.CylinderGeometry(0.435, 0.435, 0.12, 22);
  rim.rotateZ(Math.PI / 2);
  rim.translate(-0.88, 0, 0);

  const webNeck = new THREE.CylinderGeometry(0.36, 0.36, 0.14, 20);
  webNeck.rotateZ(Math.PI / 2);
  webNeck.translate(-0.77, 0, 0);

  const solid = mergeParts([body, rim, webNeck]);
  const hollow = new THREE.CylinderGeometry(0.37, 0.37, 1.15, 18);
  hollow.rotateZ(Math.PI / 2);
  hollow.translate(0.42, 0, 0);

  return csgSubtract(solid, [hollow]);
}

function build9mmBulletGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.45),
    new THREE.Vector2(0.39, -0.45),
    new THREE.Vector2(0.39, 0.05),
    new THREE.Vector2(0.35, 0.32),
    new THREE.Vector2(0.24, 0.56),
    new THREE.Vector2(0.11, 0.72),
    new THREE.Vector2(0, 0.78),
  ];
  const lathe = new THREE.LatheGeometry(pts, 22);
  lathe.rotateZ(-Math.PI / 2);
  return lathe;
}

/**
 * Authentic 7.62×39mm M43 bottleneck tapered rifle cartridge case (X_local ∈ [-1.12, +1.12])
 */
function build762CaseGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.12),
    new THREE.Vector2(0.31, -1.12), // Rim
    new THREE.Vector2(0.31, -1.02),
    new THREE.Vector2(0.25, -0.99), // Extractor groove
    new THREE.Vector2(0.25, -0.89),
    new THREE.Vector2(0.31, -0.85), // Base web
    new THREE.Vector2(0.275, 0.48), // Steep M43 body taper
    new THREE.Vector2(0.215, 0.74), // Bottleneck shoulder
    new THREE.Vector2(0.21, 1.12), // Case neck mouth
    new THREE.Vector2(0.17, 1.12),
    new THREE.Vector2(0.17, 0.55),
    new THREE.Vector2(0, 0.55),
  ];
  const lathe = new THREE.LatheGeometry(pts, 22);
  lathe.rotateZ(-Math.PI / 2);
  return lathe;
}

function build762BulletGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.35),
    new THREE.Vector2(0.16, -0.35),
    new THREE.Vector2(0.195, -0.15),
    new THREE.Vector2(0.195, 0.15),
    new THREE.Vector2(0.16, 0.52),
    new THREE.Vector2(0.095, 0.86),
    new THREE.Vector2(0.035, 1.08),
    new THREE.Vector2(0, 1.16),
  ];
  const lathe = new THREE.LatheGeometry(pts, 20);
  lathe.rotateZ(-Math.PI / 2);
  return lathe;
}

/**
 * Authentic 5.56×45mm NATO (M855) slender bottleneck brass case (X_local ∈ [-1.25, +1.25])
 */
function build556CaseGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.25),
    new THREE.Vector2(0.265, -1.25), // Rimless head
    new THREE.Vector2(0.265, -1.16),
    new THREE.Vector2(0.21, -1.13), // Extractor groove
    new THREE.Vector2(0.21, -1.03),
    new THREE.Vector2(0.265, -0.99), // Web
    new THREE.Vector2(0.248, 0.62), // Straight-tapered NATO body
    new THREE.Vector2(0.168, 0.88), // 23° shoulder
    new THREE.Vector2(0.164, 1.25), // Slim 5.56 neck
    new THREE.Vector2(0.132, 1.25),
    new THREE.Vector2(0.132, 0.72),
    new THREE.Vector2(0, 0.72),
  ];
  const lathe = new THREE.LatheGeometry(pts, 22);
  lathe.rotateZ(-Math.PI / 2);
  return lathe;
}

function build556BulletGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.32),
    new THREE.Vector2(0.122, -0.32), // Boat-tail
    new THREE.Vector2(0.152, -0.14),
    new THREE.Vector2(0.152, 0.16),
    new THREE.Vector2(0.125, 0.5),
    new THREE.Vector2(0.072, 0.82),
    new THREE.Vector2(0.025, 1.02),
    new THREE.Vector2(0, 1.1), // High-velocity spitzer point
  ];
  const lathe = new THREE.LatheGeometry(pts, 20);
  lathe.rotateZ(-Math.PI / 2);
  return lathe;
}

/**
 * Authentic .338 Lapua Magnum (8.6×70mm) long-range bottleneck sniper case (X_local ∈ [-1.72, +1.72])
 */
function build338LapuaCaseGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.72),
    new THREE.Vector2(0.375, -1.72), // Thick .588" Lapua head
    new THREE.Vector2(0.375, -1.58),
    new THREE.Vector2(0.305, -1.54), // Extractor groove
    new THREE.Vector2(0.305, -1.4),
    new THREE.Vector2(0.374, -1.35), // Case web
    new THREE.Vector2(0.345, 0.82), // Magnum powder body
    new THREE.Vector2(0.246, 1.2), // 20° shoulder
    new THREE.Vector2(0.24, 1.72), // .338 neck mouth
    new THREE.Vector2(0.195, 1.72),
    new THREE.Vector2(0.195, 1.04),
    new THREE.Vector2(0, 1.04),
  ];
  const lathe = new THREE.LatheGeometry(pts, 24);
  lathe.rotateZ(-Math.PI / 2);
  return lathe;
}

function build338LapuaBulletGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.52),
    new THREE.Vector2(0.172, -0.52), // Deep VLD boat-tail
    new THREE.Vector2(0.22, -0.24),
    new THREE.Vector2(0.22, 0.18),
    new THREE.Vector2(0.188, 0.68),
    new THREE.Vector2(0.125, 1.16),
    new THREE.Vector2(0.052, 1.52),
    new THREE.Vector2(0, 1.68), // Needle secant-ogive match tip
  ];
  const lathe = new THREE.LatheGeometry(pts, 22);
  lathe.rotateZ(-Math.PI / 2);
  return lathe;
}

/**
 * Massive .50 BMG (12.7×99mm NATO) anti-materiel brass cartridge case (X_local ∈ [-2.25, +2.25])
 */
function build50BmgCaseGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, -2.25),
    new THREE.Vector2(0.485, -2.25), // .804" heavy rim
    new THREE.Vector2(0.485, -2.08),
    new THREE.Vector2(0.398, -2.03), // Deep extractor groove
    new THREE.Vector2(0.398, -1.85),
    new THREE.Vector2(0.482, -1.78), // Heavy base web
    new THREE.Vector2(0.435, 1.08), // Long tapered 99mm body
    new THREE.Vector2(0.322, 1.56), // Bottleneck shoulder
    new THREE.Vector2(0.315, 2.25), // .50 cal neck mouth
    new THREE.Vector2(0.262, 2.25),
    new THREE.Vector2(0.262, 1.4),
    new THREE.Vector2(0, 1.4),
  ];
  const lathe = new THREE.LatheGeometry(pts, 26);
  lathe.rotateZ(-Math.PI / 2);
  return lathe;
}

function build50BmgBulletGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.65),
    new THREE.Vector2(0.225, -0.65), // Heavy 660gr boat-tail
    new THREE.Vector2(0.288, -0.32),
    new THREE.Vector2(0.288, 0.24),
    new THREE.Vector2(0.245, 0.88),
    new THREE.Vector2(0.165, 1.48),
    new THREE.Vector2(0.072, 1.94),
    new THREE.Vector2(0, 2.15), // .50 BMG armor-piercing spitzer point
  ];
  const lathe = new THREE.LatheGeometry(pts, 24);
  lathe.rotateZ(-Math.PI / 2);
  return lathe;
}

/**
 * Authentic .50 Action Express (12.7×32.6mm) rebated-rim magnum pistol case (X_local ∈ [-1.18, +1.18])
 */
function build50AeCaseGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.18),
    new THREE.Vector2(0.445, -1.18), // Signature rebated rim (narrower than body!)
    new THREE.Vector2(0.445, -1.06),
    new THREE.Vector2(0.375, -1.03), // Deep extractor groove
    new THREE.Vector2(0.375, -0.91),
    new THREE.Vector2(0.525, -0.84), // Step out to fat .547" magnum body
    new THREE.Vector2(0.505, 1.18), // Straight-tapered mouth
    new THREE.Vector2(0.448, 1.18),
    new THREE.Vector2(0.448, 0.42),
    new THREE.Vector2(0, 0.42),
  ];
  const lathe = new THREE.LatheGeometry(pts, 24);
  lathe.rotateZ(-Math.PI / 2);
  return lathe;
}

/**
 * Iconic .50 AE 300-grain Jacketed Hollow-Point (JHP) flat-meplat truncated cone projectile
 */
function build50AeBulletGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.45),
    new THREE.Vector2(0.468, -0.45),
    new THREE.Vector2(0.468, 0.22), // Wide .500" bearing surface
    new THREE.Vector2(0.34, 0.88), // Truncated cone ogive
    new THREE.Vector2(0.24, 0.92), // Flat JHP meplat rim
    new THREE.Vector2(0.16, 0.72), // Hollow-point cavity!
    new THREE.Vector2(0, 0.68),
  ];
  const lathe = new THREE.LatheGeometry(pts, 24);
  lathe.rotateZ(-Math.PI / 2);
  return lathe;
}

interface CaliberVisualSpec {
  caseColor: string;
  reserveCaseColor: string;
  bulletColor: string;
  bulletLocalOffset: number;
  reserveTiltZ: number;
  flashScaleMult: number;
  streakThickness: number;
}

const CALIBER_VISUAL_SPECS: Record<CaliberProfile, CaliberVisualSpec> = {
  '9mm_para': {
    caseColor: '#eab308',
    reserveCaseColor: '#ca8a04',
    bulletColor: '#c2410c',
    bulletLocalOffset: 1.33,
    reserveTiltZ: 0.12,
    flashScaleMult: 0.95,
    streakThickness: 0.18,
  },
  '762_m43': {
    caseColor: '#b48a3e',
    reserveCaseColor: '#926f30',
    bulletColor: '#c2410c',
    bulletLocalOffset: 1.85,
    reserveTiltZ: 0.18,
    flashScaleMult: 1.1,
    streakThickness: 0.2,
  },
  '556_nato': {
    caseColor: '#d9a520',
    reserveCaseColor: '#b38616',
    bulletColor: '#c2410c',
    bulletLocalOffset: 1.98,
    reserveTiltZ: 0.1,
    flashScaleMult: 1.12,
    streakThickness: 0.17,
  },
  '338_lapua': {
    caseColor: '#dfb13b',
    reserveCaseColor: '#b88e28',
    bulletColor: '#b45309',
    bulletLocalOffset: 2.75,
    reserveTiltZ: 0.05,
    flashScaleMult: 1.48,
    streakThickness: 0.25,
  },
  '50_bmg': {
    caseColor: '#cfa132',
    reserveCaseColor: '#a67e22',
    bulletColor: '#b9380b',
    bulletLocalOffset: 3.65,
    reserveTiltZ: 0.04,
    flashScaleMult: 1.85,
    streakThickness: 0.34,
  },
  '50_ae': {
    caseColor: '#e5c158',
    reserveCaseColor: '#c49e38',
    bulletColor: '#c2410c',
    bulletLocalOffset: 1.58,
    reserveTiltZ: 0.1,
    flashScaleMult: 1.42,
    streakThickness: 0.28,
  },
};

const caliberGeoCache = new Map<
  CaliberProfile,
  { caseGeo: THREE.BufferGeometry; bulletGeo: THREE.BufferGeometry }
>();

function getCaliberGeometries(profile: CaliberProfile): {
  caseGeo: THREE.BufferGeometry;
  bulletGeo: THREE.BufferGeometry;
} {
  const cached = caliberGeoCache.get(profile);
  if (cached) return cached;

  let built: { caseGeo: THREE.BufferGeometry; bulletGeo: THREE.BufferGeometry };
  switch (profile) {
    case '762_m43':
      built = {
        caseGeo: build762CaseGeometry(),
        bulletGeo: build762BulletGeometry(),
      };
      break;
    case '556_nato':
      built = {
        caseGeo: build556CaseGeometry(),
        bulletGeo: build556BulletGeometry(),
      };
      break;
    case '338_lapua':
      built = {
        caseGeo: build338LapuaCaseGeometry(),
        bulletGeo: build338LapuaBulletGeometry(),
      };
      break;
    case '50_bmg':
      built = {
        caseGeo: build50BmgCaseGeometry(),
        bulletGeo: build50BmgBulletGeometry(),
      };
      break;
    case '50_ae':
      built = {
        caseGeo: build50AeCaseGeometry(),
        bulletGeo: build50AeBulletGeometry(),
      };
      break;
    case '9mm_para':
    default:
      built = {
        caseGeo: build9mmCaseGeometry(),
        bulletGeo: build9mmBulletGeometry(),
      };
      break;
  }

  caliberGeoCache.set(profile, built);
  return built;
}

function resolveWeaponRoundFit(
  weaponId: string,
  caliberProfile: CaliberProfile
): { roundScale: number; magLocalShiftX: number } {
  if (weaponId === 'mp5') {
    return { roundScale: 0.52, magLocalShiftX: -0.35 };
  }
  if (caliberProfile === '556_nato') {
    if (weaponId === 'aug') {
      return { roundScale: 0.56, magLocalShiftX: -1.06 };
    }
    return { roundScale: 0.6, magLocalShiftX: -0.92 };
  }
  if (caliberProfile === '50_bmg') {
    return { roundScale: 0.68, magLocalShiftX: -1.8 };
  }
  return { roundScale: 1.0, magLocalShiftX: 0 };
}

interface FiringBallisticsProps {
  animatedFirePhaseRef: React.MutableRefObject<number>;
}

export const FiringBallistics: React.FC<FiringBallisticsProps> = ({
  animatedFirePhaseRef,
}) => {
  const mode = useExplodeStore((s) => s.mode);
  const activeWeaponId = useExplodeStore((s) => s.activeWeaponId);
  const showEdges = useExplodeStore((s) => s.showEdges);

  const caliberProfile = getWeaponCaliberProfile(activeWeaponId);
  const meta = getWeaponWorkbenchMeta(activeWeaponId);
  const calSpec = CALIBER_VISUAL_SPECS[caliberProfile];
  const roundFit = resolveWeaponRoundFit(activeWeaponId, caliberProfile);

  const { caseGeo, bulletGeo } = useMemo(
    () => getCaliberGeometries(caliberProfile),
    [caliberProfile]
  );

  const is50Bmg = caliberProfile === '50_bmg';
  const is338Lapua = caliberProfile === '338_lapua';
  const is50Ae = caliberProfile === '50_ae';

  const spentCaseRef = useRef<THREE.Group>(null);
  const spentCaseMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const bulletGroupRef = useRef<THREE.Group>(null);
  const streakMeshRef = useRef<THREE.Mesh>(null);

  const chamberFlashRef = useRef<THREE.Mesh>(null);
  const chamberLightRef = useRef<THREE.PointLight>(null);

  const gasPortFlashRef = useRef<THREE.Mesh>(null);

  const muzzleGroupRef = useRef<THREE.Group>(null);
  const muzzleOuterMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const muzzleCoreMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const brakeWingOuterMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const brakeWingCoreMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const shockRingRef = useRef<THREE.Mesh>(null);
  const shockRingMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const magnumRingRef = useRef<THREE.Group>(null);
  const magnumRingOuterMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const magnumRingCoreMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const nextRoundRef = useRef<THREE.Group>(null);
  const nextRoundInnerRef = useRef<THREE.Group>(null);
  const reserveRoundRef = useRef<THREE.Group>(null);
  const reserveRoundInnerRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const state = useExplodeStore.getState();
    if (state.mode !== 'firing') return;
    const f = animatedFirePhaseRef.current;
    const curProfile = getWeaponCaliberProfile(state.activeWeaponId);
    const curSpec = CALIBER_VISUAL_SPECS[curProfile];
    const curFit = resolveWeaponRoundFit(state.activeWeaponId, curProfile);
    const st = computeWeaponBallisticsState(state.activeWeaponId, f);

    if (spentCaseRef.current && spentCaseMatRef.current) {
      spentCaseRef.current.visible = st.spentCaseVisible;
      spentCaseRef.current.position.set(...st.spentCasePos);
      spentCaseRef.current.rotation.set(...st.spentCaseRot);
      spentCaseRef.current.scale.setScalar(curFit.roundScale);
      spentCaseMatRef.current.opacity = st.spentCaseOpacity;
      spentCaseMatRef.current.transparent = st.spentCaseOpacity < 0.99;
    }

    if (bulletGroupRef.current) {
      bulletGroupRef.current.visible = st.bulletVisible;
      bulletGroupRef.current.position.set(...st.bulletPos);
      bulletGroupRef.current.rotation.set(f * 42, 0, 0);
      bulletGroupRef.current.scale.setScalar(curFit.roundScale);
    }
    if (streakMeshRef.current) {
      const showStreak = st.bulletVisible && st.streakLength > 0.1;
      streakMeshRef.current.visible = showStreak;
      if (showStreak) {
        streakMeshRef.current.scale.set(
          st.streakLength,
          curSpec.streakThickness,
          curSpec.streakThickness
        );
        streakMeshRef.current.position.set(
          st.bulletPos[0] - st.streakLength * 0.5 - 0.35,
          st.bulletPos[1],
          st.bulletPos[2]
        );
      }
    }

    if (chamberFlashRef.current) {
      chamberFlashRef.current.visible = st.chamberFlashIntensity > 0.02;
      const baseChamberScale =
        curProfile === '50_bmg'
          ? 1.25
          : curProfile === '338_lapua'
            ? 1.05
            : 0.72;
      const s = baseChamberScale + st.chamberFlashIntensity * 0.75;
      chamberFlashRef.current.scale.set(s * 1.45, s, s);
      (chamberFlashRef.current.material as THREE.MeshBasicMaterial).opacity =
        st.chamberFlashIntensity * 0.86;
    }
    if (chamberLightRef.current) {
      const lightBoost = curProfile === '50_bmg' ? 7.5 : 4.5;
      chamberLightRef.current.intensity =
        st.chamberFlashIntensity * lightBoost;
    }

    // Gas-Block / Under-Barrel Port Tap Impulse Flash (active on gas-operated firearms)
    if (gasPortFlashRef.current) {
      const activeGas = st.gasPortFlashIntensity > 0.02;
      gasPortFlashRef.current.visible = activeGas;
      if (activeGas) {
        gasPortFlashRef.current.position.set(...st.gasPortPos);
        const gs = 0.65 + st.gasPortFlashIntensity * 0.85;
        gasPortFlashRef.current.scale.set(gs * 1.6, gs, gs);
        (gasPortFlashRef.current.material as THREE.MeshBasicMaterial).opacity =
          st.gasPortFlashIntensity * 0.85;
      }
    }

    if (
      muzzleGroupRef.current &&
      muzzleOuterMatRef.current &&
      muzzleCoreMatRef.current
    ) {
      const active = st.muzzlePlumeOpacity > 0.02;
      muzzleGroupRef.current.visible = active;
      if (active) {
        const s = st.muzzlePlumeScale * curSpec.flashScaleMult;
        muzzleGroupRef.current.scale.set(s * 1.32, s, s);
        muzzleOuterMatRef.current.opacity = st.muzzlePlumeOpacity * 0.56;
        muzzleCoreMatRef.current.opacity = st.muzzlePlumeOpacity * 0.9;
        if (brakeWingOuterMatRef.current) {
          brakeWingOuterMatRef.current.opacity = st.muzzlePlumeOpacity * 0.68;
        }
        if (brakeWingCoreMatRef.current) {
          brakeWingCoreMatRef.current.opacity = st.muzzlePlumeOpacity * 0.92;
        }
      }
    }

    if (shockRingRef.current && shockRingMatRef.current) {
      const active = st.muzzlePlumeOpacity > 0.02;
      shockRingRef.current.visible = active;
      if (active) {
        const ringBoost =
          curProfile === '50_bmg'
            ? 2.45
            : curProfile === '50_ae'
              ? 2.05
              : curProfile === '338_lapua'
                ? 1.85
                : 1.5;
        const rs = st.muzzlePlumeScale * ringBoost;
        shockRingRef.current.scale.set(rs, rs, rs);
        shockRingMatRef.current.opacity = st.muzzlePlumeOpacity * 0.68;
      }
    }

    // Iconic .50 AE Desert Eagle Expanding Toroidal Magnum Fire Ring
    if (
      magnumRingRef.current &&
      magnumRingOuterMatRef.current &&
      magnumRingCoreMatRef.current
    ) {
      const activeMagnum = curProfile === '50_ae' && st.muzzlePlumeOpacity > 0.02;
      magnumRingRef.current.visible = activeMagnum;
      if (activeMagnum) {
        const ms = 0.85 + st.muzzlePlumeScale * 1.45;
        magnumRingRef.current.position.set(
          meta.muzzlePos[0] + 1.4 + st.muzzlePlumeScale * 1.65,
          meta.muzzlePos[1],
          meta.muzzlePos[2]
        );
        magnumRingRef.current.scale.set(ms * 0.85, ms, ms);
        magnumRingOuterMatRef.current.opacity = st.muzzlePlumeOpacity * 0.78;
        magnumRingCoreMatRef.current.opacity = st.muzzlePlumeOpacity * 0.95;
      }
    }

    if (nextRoundRef.current) {
      nextRoundRef.current.position.set(...st.nextRoundPos);
      nextRoundRef.current.rotation.set(0, 0, st.nextRoundRotZ);
      nextRoundRef.current.scale.setScalar(curFit.roundScale);
    }
    if (nextRoundInnerRef.current) {
      const uFeed = THREE.MathUtils.clamp((f - 0.6) / 0.24, 0, 1);
      const feedBlend = uFeed * uFeed * (3 - 2 * uFeed);
      nextRoundInnerRef.current.position.x =
        curFit.magLocalShiftX * (1 - feedBlend);
    }
    if (reserveRoundRef.current) {
      reserveRoundRef.current.position.set(...st.reserveRoundPos);
      reserveRoundRef.current.rotation.set(0, 0, curSpec.reserveTiltZ);
      reserveRoundRef.current.scale.setScalar(curFit.roundScale);
    }
    if (reserveRoundInnerRef.current) {
      reserveRoundInnerRef.current.position.x = curFit.magLocalShiftX;
    }
  });

  if (mode !== 'firing') return null;

  return (
    <group>
      {/* 1. Chambered / Extracted / Ejected Cartridge Case */}
      <group
        ref={spentCaseRef}
        position={meta.chamberGlowPos}
        scale={roundFit.roundScale}
      >
        <mesh geometry={caseGeo} renderOrder={2}>
          <meshStandardMaterial
            ref={spentCaseMatRef}
            color={calSpec.caseColor}
            metalness={0.82}
            roughness={0.23}
          />
          {showEdges && <Edges threshold={32} color="#854d0e" />}
        </mesh>
      </group>

      {/* 2. Fired Jacketed Bullet Projectile */}
      <group
        ref={bulletGroupRef}
        position={meta.chamberGlowPos}
        scale={roundFit.roundScale}
      >
        <mesh geometry={bulletGeo} renderOrder={2}>
          <meshStandardMaterial
            color={calSpec.bulletColor}
            metalness={0.78}
            roughness={0.24}
          />
          {showEdges && <Edges threshold={32} color="#7c2d12" />}
        </mesh>
      </group>

      {/* Supersonic Projectile Motion Trail */}
      <mesh ref={streakMeshRef} visible={false} renderOrder={8}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color="#ea580c"
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Internal Chamber Ignition Glow */}
      <mesh
        ref={chamberFlashRef}
        position={meta.chamberGlowPos}
        visible={false}
        renderOrder={9}
      >
        <sphereGeometry args={[0.52, 16, 12]} />
        <meshBasicMaterial
          color="#f97316"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      <pointLight
        ref={chamberLightRef}
        position={[
          meta.chamberGlowPos[0] + 0.2,
          meta.chamberGlowPos[1],
          0.6,
        ]}
        color="#f97316"
        intensity={0}
        distance={14}
      />

      {/* 3b. Gas-Block / Piston Port Tap Impulse Glow */}
      <mesh ref={gasPortFlashRef} visible={false} renderOrder={9}>
        <sphereGeometry args={[0.48, 16, 12]} />
        <meshBasicMaterial
          color="#fb923c"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>

      {/* 4. Caliber-Specific Muzzle Gas Plume & Tactical Brake Blast */}
      <group ref={muzzleGroupRef} position={meta.muzzlePos} visible={false}>
        {/* Forward primary outer plume */}
        <mesh
          rotation={[0, 0, -Math.PI / 2]}
          position={[is50Ae ? 1.35 : 1.65, 0, 0]}
          renderOrder={9}
        >
          <coneGeometry
            args={[is50Ae ? 1.55 : 1.15, is50Ae ? 2.8 : 3.4, 20, 1, true]}
          />
          <meshBasicMaterial
            ref={muzzleOuterMatRef}
            color="#f59e0b"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* Forward incandescent inner core */}
        <mesh
          rotation={[0, 0, -Math.PI / 2]}
          position={[0.95, 0, 0]}
          renderOrder={9}
        >
          <coneGeometry args={[is50Ae ? 0.78 : 0.52, 1.95, 16]} />
          <meshBasicMaterial
            ref={muzzleCoreMatRef}
            color={is50Bmg || is50Ae ? '#fef08a' : '#ea580c'}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>

        {/* HUGE Dual-Side Swept-Back Arrowhead Brake Blast for .50 BMG (Barrett M82A1) */}
        {is50Bmg && (
          <>
            {/* Right (+Z) & Left (-Z) primary swept-back arrowhead baffle wings */}
            {[1, -1].map((side) => (
              <group
                key={`bmg-wing-${side}`}
                position={[-0.65, 0, side * 0.42]}
                rotation={[0, side * -0.52, 0]}
              >
                <mesh
                  rotation={[side * (Math.PI / 2), 0, 0]}
                  position={[0, 0, side * 2.35]}
                  renderOrder={9}
                >
                  <coneGeometry args={[1.25, 4.7, 18, 1, true]} />
                  <meshBasicMaterial
                    ref={side === 1 ? brakeWingOuterMatRef : undefined}
                    color="#f97316"
                    transparent
                    opacity={0.62}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                  />
                </mesh>
                <mesh
                  rotation={[side * (Math.PI / 2), 0, 0]}
                  position={[0, 0, side * 1.45]}
                  renderOrder={9}
                >
                  <coneGeometry args={[0.58, 2.8, 14]} />
                  <meshBasicMaterial
                    ref={side === 1 ? brakeWingCoreMatRef : undefined}
                    color="#fef3c7"
                    transparent
                    opacity={0.88}
                    depthWrite={false}
                  />
                </mesh>
                {/* Second arrowhead baffle chamber jet */}
                <mesh
                  rotation={[side * (Math.PI / 2), 0, 0]}
                  position={[-0.85, 0, side * 1.65]}
                  renderOrder={9}
                >
                  <coneGeometry args={[0.82, 3.2, 14, 1, true]} />
                  <meshBasicMaterial
                    color="#fb923c"
                    transparent
                    opacity={0.52}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                  />
                </mesh>
              </group>
            ))}
          </>
        )}

        {/* Dual-Chamber Lateral Muzzle Brake Vents for .338 Lapua Magnum (AWM) */}
        {is338Lapua && (
          <>
            {[1, -1].map((side) => (
              <group
                key={`lapua-vent-${side}`}
                position={[-0.35, 0, side * 0.28]}
                rotation={[0, side * -0.25, 0]}
              >
                <mesh
                  rotation={[side * (Math.PI / 2), 0, 0]}
                  position={[0, 0, side * 1.35]}
                  renderOrder={9}
                >
                  <coneGeometry args={[0.68, 2.65, 16, 1, true]} />
                  <meshBasicMaterial
                    ref={side === 1 ? brakeWingOuterMatRef : undefined}
                    color="#f59e0b"
                    transparent
                    opacity={0.56}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                  />
                </mesh>
                <mesh
                  rotation={[side * (Math.PI / 2), 0, 0]}
                  position={[0, 0, side * 0.85]}
                  renderOrder={9}
                >
                  <coneGeometry args={[0.32, 1.55, 12]} />
                  <meshBasicMaterial
                    ref={side === 1 ? brakeWingCoreMatRef : undefined}
                    color="#fde68a"
                    transparent
                    opacity={0.85}
                    depthWrite={false}
                  />
                </mesh>
              </group>
            ))}
          </>
        )}
      </group>

      {/* Primary Concussion Shockwave Ring */}
      <mesh
        ref={shockRingRef}
        position={[
          meta.muzzlePos[0] + 0.25,
          meta.muzzlePos[1],
          meta.muzzlePos[2],
        ]}
        rotation={[0, Math.PI / 2, 0]}
        visible={false}
        renderOrder={9}
      >
        <torusGeometry args={[0.98, is50Bmg ? 0.1 : 0.06, 12, 32]} />
        <meshBasicMaterial
          ref={shockRingMatRef}
          color="#f97316"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>

      {/* Signature .50 AE Desert Eagle Luminous Magnum Fireball Ring */}
      <group
        ref={magnumRingRef}
        position={[
          meta.muzzlePos[0] + 2.2,
          meta.muzzlePos[1],
          meta.muzzlePos[2],
        ]}
        rotation={[0, Math.PI / 2, 0]}
        visible={false}
      >
        <mesh renderOrder={9}>
          <torusGeometry args={[1.42, 0.28, 16, 36]} />
          <meshBasicMaterial
            ref={magnumRingOuterMatRef}
            color="#f97316"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
        <mesh renderOrder={10}>
          <torusGeometry args={[1.42, 0.12, 14, 36]} />
          <meshBasicMaterial
            ref={magnumRingCoreMatRef}
            color="#fef08a"
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* 5. Next Complete Cartridge in Magazine */}
      <group ref={nextRoundRef} scale={roundFit.roundScale}>
        <group
          ref={nextRoundInnerRef}
          position={[roundFit.magLocalShiftX, 0, 0]}
        >
          <mesh geometry={caseGeo} renderOrder={2}>
            <meshStandardMaterial
              color={calSpec.caseColor}
              metalness={0.82}
              roughness={0.23}
            />
            {showEdges && <Edges threshold={32} color="#854d0e" />}
          </mesh>
          <mesh
            geometry={bulletGeo}
            position={[calSpec.bulletLocalOffset, 0, 0]}
            renderOrder={2}
          >
            <meshStandardMaterial
              color={calSpec.bulletColor}
              metalness={0.78}
              roughness={0.24}
            />
            {showEdges && <Edges threshold={32} color="#7c2d12" />}
          </mesh>
        </group>
      </group>

      {/* 6. Reserve Cartridge below in Magazine Stack */}
      <group ref={reserveRoundRef} scale={roundFit.roundScale}>
        <group
          ref={reserveRoundInnerRef}
          position={[roundFit.magLocalShiftX, 0, 0]}
        >
          <mesh geometry={caseGeo} renderOrder={2}>
            <meshStandardMaterial
              color={calSpec.reserveCaseColor}
              metalness={0.78}
              roughness={0.28}
            />
          </mesh>
          <mesh
            geometry={bulletGeo}
            position={[calSpec.bulletLocalOffset, 0, 0]}
            renderOrder={2}
          >
            <meshStandardMaterial
              color="#9a3412"
              metalness={0.75}
              roughness={0.28}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
};
