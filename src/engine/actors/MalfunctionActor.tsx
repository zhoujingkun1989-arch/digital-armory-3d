import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { getLoadedWeaponPlugin } from '../../weapons/registry';
import {
  isArcheryMalfunctionWeapon,
  WEAPON_MALFUNCTION_PROFILES,
} from '../malfunctions/malfunctionSpecs';
import { malfunctionStore } from '../malfunctions/malfunctionStore';
import { getWeaponFiringTiming } from '../physics/armoryPhysics';
import {
  CALIBER_VISUAL_SPECS,
  WEAPON_ROUND_FIT,
  getCaliberGeometries,
} from './BallisticsSystem';

// Module-cached diagnostic indicator geometries (read-only, zero per-frame allocation)
const PRIMER_DIAG_RING_GEO = (() => {
  const g = new THREE.RingGeometry(0.16, 0.31, 28);
  g.rotateY(-Math.PI / 2);
  return g;
})();

const OOB_GAP_COLLAR_GEO = (() => {
  const g = new THREE.TorusGeometry(0.62, 0.045, 12, 32);
  g.rotateY(Math.PI / 2);
  return g;
})();

// Module-cached archery carbon arrow/bolt shaft + broadhead + nock + fletching geometries
// (`1 unit = 1 cm`; zero floating brass rifle shells on `lift33` or `r500`!)
const ARCHERY_SHAFT_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.32, 0.32, 34, 14);
  g.rotateZ(-Math.PI / 2);
  g.translate(17, 0, 0);
  return g;
})();

const ARCHERY_BROADHEAD_GEO = (() => {
  const g = new THREE.ConeGeometry(0.66, 3.2, 3);
  g.rotateZ(-Math.PI / 2);
  g.translate(35.4, 0, 0);
  return g;
})();

const ARCHERY_NOCK_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.37, 0.37, 1.35, 14);
  g.rotateZ(-Math.PI / 2);
  g.translate(-0.5, 0, 0);
  return g;
})();

const ARCHERY_VANES_GEO = (() => {
  const g = new THREE.ConeGeometry(0.92, 4.2, 3);
  g.rotateZ(-Math.PI / 2);
  g.translate(3.2, 0, 0);
  return g;
})();

const ARCHERY_DIAG_RING_GEO = (() => {
  const g = new THREE.TorusGeometry(1.1, 0.08, 10, 28);
  g.rotateY(Math.PI / 2);
  return g;
})();

const DEFAULT_ROUND_FIT = {
  roundScale: 0.72,
  magLocalShiftX: 0,
  ignitionF: 0.32,
} as const;

/**
 * WP-09 — Classic Firearm Malfunction 3D Cutaway Cartridge & Stoppage Actor
 * -------------------------------------------------------------------------
 * Renders weapon-fitted 3D jammed casings, double-fed live rounds, shallow
 * light-struck primers, and out-of-battery headspace warning collars inside
 * `<WeaponRecoilGroup>`, synchronized at 60Hz with `malfunctionStore`.
 */
export const MalfunctionActor: React.FC = () => {
  const screen = useAppStore((s) => s.screen);
  const malfunctionActive = useAppStore((s) => s.malfunctionActive);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);

  const manifest = getWeaponManifest(activeWeaponId);
  const caliberProfile = manifest.caliberProfile;
  const isArchery = isArcheryMalfunctionWeapon(activeWeaponId);
  const useMultiToneCartridge =
    caliberProfile === '12_gauge' || caliberProfile === '357_magnum';
  const calSpec =
    CALIBER_VISUAL_SPECS[caliberProfile] ?? CALIBER_VISUAL_SPECS['556_nato'];
  const roundFit = WEAPON_ROUND_FIT[activeWeaponId] ?? DEFAULT_ROUND_FIT;
  const safeCaliberKey =
    CALIBER_VISUAL_SPECS[caliberProfile] !== undefined
      ? caliberProfile
      : ('556_nato' as const);

  // NOTE: `getCaliberGeometries` returns cached module-level singletons shared with
  // `BallisticsSystem` and `MagazineAmmoStack` (`caliberGeoCache`) — never `.dispose()` here.
  // All JSX `<meshStandardMaterial>` / `<meshBasicMaterial>` children are disposed by R3F on unmount.
  const { caseGeo, bulletGeo, livePrimerGeo, spentPrimerGeo, sootRingGeo, xHead } =
    useMemo(() => getCaliberGeometries(safeCaliberKey), [safeCaliberKey]);

  const primaryGroupRef = useRef<THREE.Group>(null);
  const primaryBulletRef = useRef<THREE.Mesh>(null);
  const primaryLivePrimerRef = useRef<THREE.Mesh>(null);
  const primaryStruckGroupRef = useRef<THREE.Group>(null);
  const primaryDiagRingRef = useRef<THREE.Mesh>(null);
  const primaryDiagRingMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const secondRoundGroupRef = useRef<THREE.Group>(null);

  const oobCollarRef = useRef<THREE.Mesh>(null);
  const oobCollarMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const freshRoundGroupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const st = useAppStore.getState();
    if (st.screen !== 'workbench' || !st.malfunctionActive) return;

    const vis = malfunctionStore.getTransientVisuals();
    const weaponId = st.activeWeaponId;
    const isArcheryActive = isArcheryMalfunctionWeapon(weaponId);
    const curManifest = getWeaponManifest(weaponId);
    const meta = curManifest.workbenchMeta;
    const fit = WEAPON_ROUND_FIT[weaponId] ?? DEFAULT_ROUND_FIT;
    const prof = WEAPON_MALFUNCTION_PROFILES[weaponId];
    const plugin = getLoadedWeaponPlugin(weaponId);
    const timing = getWeaponFiringTiming(weaponId);
    const nowSec = performance.now() * 0.001;
    const pulse = 0.5 + 0.5 * Math.sin(nowSec * 6.5);

    const cx = meta.chamberGlowPos[0];
    const cy = meta.chamberGlowPos[1];
    const cz = meta.chamberGlowPos[2];
    const isTank = meta.scaleProfile === 'main_battle_tank';
    const dScale = isTank ? 9.0 : 1.0;
    const isDownwardEject = prof.ejectionUpSign < 0;
    const ejectZ = 1;

    if (isArcheryActive) {
      const isBow =
        weaponId === 'lift33' ||
        weaponId === 'hoytrx8' ||
        weaponId === 'englishlongbow';
      const nockBaseX = isBow ? -16.5 : -22.0;
      const boreY = isBow ? 2.4 : 1.8;
      const shaftScale = isBow ? 1.15 : 0.92;
      const pGrp = primaryGroupRef.current;
      if (pGrp) {
        const clr = vis.caseClearAlpha;
        pGrp.visible = clr < 0.995;
        if (pGrp.visible) {
          pGrp.scale.setScalar(shaftScale * (1 - 0.14 * clr));
          if (vis.kind === 'stovepipe') {
            // Vane / Rest Timing Hang-Up: skewed carbon shaft tilted near launcher fork / retention arm
            pGrp.position.set(
              nockBaseX + (isBow ? 5.5 : 18.0) + 12.0 * clr,
              boreY + 0.45 + 3.2 * clr,
              cz + 1.2 * clr
            );
            pGrp.rotation.set(0.08 * (1 - clr), 0.11 * (1 - clr), -0.14 * (1 - clr));
            if (primaryDiagRingRef.current) {
              primaryDiagRingRef.current.visible = clr < 0.25;
              primaryDiagRingRef.current.position.set(isBow ? 17.5 : 8.5, 0, 0);
              primaryDiagRingRef.current.scale.setScalar(0.95 + 0.22 * pulse);
            }
          } else if (vis.kind === 'double_feed') {
            // Nock Pinch: shaft canted upward off string serving
            pGrp.position.set(
              nockBaseX - 3.5 * clr,
              boreY + 0.65 + 4.5 * clr,
              cz + 1.5 * clr
            );
            pGrp.rotation.set(0.05, -0.09, 0.12 * (1 - clr));
            if (primaryDiagRingRef.current) {
              primaryDiagRingRef.current.visible = clr < 0.25;
              primaryDiagRingRef.current.position.set(-0.5, 0, 0);
              primaryDiagRingRef.current.scale.setScalar(0.9 + 0.2 * pulse);
            }
          } else if (vis.kind === 'light_strike') {
            // Incomplete Latch / Release Check: pulsing amber ring at nock / D-loop datum
            pGrp.position.set(nockBaseX - 4.0 * clr, boreY + 2.6 * clr, cz);
            pGrp.rotation.set(0, 0, 0.04 * (1 - clr));
            if (primaryDiagRingRef.current) {
              primaryDiagRingRef.current.visible = clr < 0.25;
              primaryDiagRingRef.current.position.set(-0.5, 0, 0);
              primaryDiagRingRef.current.scale.setScalar(1.0 + 0.24 * pulse);
            }
          } else {
            // Anti-Dry-Fire / Cam Track Block: unseated nock offset rearward from latch / ADF pawl
            pGrp.position.set(nockBaseX - 3.2 - 3.0 * clr, boreY + 2.0 * clr, cz);
            pGrp.rotation.set(0, 0, 0);
            if (primaryDiagRingRef.current) primaryDiagRingRef.current.visible = false;
          }
          if (primaryDiagRingMatRef.current) {
            primaryDiagRingMatRef.current.color.setHex(0xf59e0b);
            primaryDiagRingMatRef.current.opacity = 0.65 + 0.32 * pulse;
          }
        }
      }

      const secGrp = secondRoundGroupRef.current;
      if (secGrp) {
        const drop = vis.secondRoundDropAlpha;
        secGrp.visible = vis.kind === 'double_feed' && drop < 0.995;
        if (secGrp.visible) {
          secGrp.position.set(
            nockBaseX + (isBow ? 1.5 : 4.0),
            boreY - 0.5 - 2.5 * drop,
            cz + 2.4 + 4.8 * drop
          );
          secGrp.rotation.set(0.18 * drop, -0.22 * (1 - drop), isBow ? Math.PI * 0.45 : -0.15);
          secGrp.scale.setScalar(shaftScale * 0.88 * (1 - 0.12 * drop));
        }
      }

      const collar = oobCollarRef.current;
      const collarMat = oobCollarMatRef.current;
      if (collar && collarMat) {
        const showOob = vis.kind === 'out_of_battery' && vis.caseClearAlpha < 0.35;
        const showCleared = vis.cleared && vis.freshChamberAlpha > 0.5;
        collar.visible = showOob || showCleared;
        if (showOob) {
          collar.position.set(nockBaseX, boreY, cz);
          collar.scale.setScalar(1.6 + 0.28 * pulse);
          collarMat.color.setHex(0xef4444);
          collarMat.opacity = 0.52 + 0.4 * pulse;
        } else if (showCleared) {
          collar.position.set(nockBaseX, boreY, cz);
          collar.scale.setScalar(1.55);
          collarMat.color.setHex(0x10b981);
          collarMat.opacity = 0.48;
        }
      }

      const freshGrp = freshRoundGroupRef.current;
      if (freshGrp) {
        const fa = vis.freshChamberAlpha;
        freshGrp.visible = fa > 0.02;
        if (freshGrp.visible) {
          freshGrp.position.set(nockBaseX - (1 - fa) * 4.0, boreY, cz);
          freshGrp.rotation.set(0, 0, 0);
          freshGrp.scale.setScalar(shaftScale);
        }
      }
      return;
    }

    // Optional plugin ballistics anchor for feed-lip / port alignment
    const ejectSample = plugin
      ? plugin.computeBallisticsState(Math.max(0.22, timing.ejectF * 0.88))
      : null;

    // 1. Primary Jammed / Misfired Cartridge or Pinched Stovepipe Brass
    const pGrp = primaryGroupRef.current;
    if (pGrp) {
      const clr = vis.caseClearAlpha;
      const visible = clr < 0.995;
      pGrp.visible = visible;

      if (visible) {
        const s = fit.roundScale * (1 - 0.18 * clr);
        pGrp.scale.setScalar(Math.max(0.01, s));

        if (vis.kind === 'stovepipe') {
          if (weaponId === 'python') {
            // Revolver Under-Extractor Rim Slip: swelled .357 case canted beneath extractor star at rear of cylinder
            pGrp.position.set(
              0.1 - 1.35 - 2.6 * clr,
              2.35 + 0.32 + 1.2 * clr,
              cz - 2.8 * clr
            );
            pGrp.rotation.set(0.12 * clr, -0.35 * clr, -0.26 * (1 - clr));
          } else if (weaponId === 'p08') {
            // Luger P08 "True Chimney" Stovepipe: spent 9mm case standing 90° upright in the open top toggle window
            pGrp.position.set(
              cx - 0.85 - 1.2 * clr,
              cy + 1.12 + 2.8 * clr - 3.6 * clr * clr,
              cz + 0.06 + 3.8 * clr
            );
            pGrp.rotation.set(
              clr * 2.2,
              0.08 + clr * 1.8,
              1.54 + clr * 2.9
            );
          } else {
            // Empty spent brass pinched upright ~82° in the ejection port
            const basePx = ejectSample
              ? ejectSample.spentCasePos[0]
              : cx - 0.95 * dScale;
            const basePy = isDownwardEject
              ? cy - 1.15 * dScale
              : cy + 0.88 * dScale;
            const basePz = isDownwardEject ? cz : cz + ejectZ * 0.56 * dScale;

            const clearDx = -1.6 * dScale * clr;
            const clearDy = isDownwardEject
              ? -5.4 * dScale * clr * clr
              : (2.2 * clr - 3.6 * clr * clr) * dScale;
            const clearDz = isDownwardEject
              ? 0.6 * dScale * clr
              : ejectZ * 4.8 * dScale * clr;

            pGrp.position.set(basePx + clearDx, basePy + clearDy, basePz + clearDz);
            pGrp.rotation.set(
              clr * 2.4,
              ejectZ * 0.28 + clr * 1.9,
              (isDownwardEject ? -1.42 : 1.38) + clr * 3.1
            );
          }

          if (primaryBulletRef.current) primaryBulletRef.current.visible = false;
          if (primaryLivePrimerRef.current)
            primaryLivePrimerRef.current.visible = false;
          if (primaryStruckGroupRef.current)
            primaryStruckGroupRef.current.visible = true;
          if (primaryDiagRingRef.current)
            primaryDiagRingRef.current.visible = false;
        } else if (vis.kind === 'double_feed') {
          // Primary spent/stuck casing still wedged in the chamber throat
          const clearDy = isDownwardEject
            ? -5.5 * dScale * clr * clr
            : (1.8 * clr - 3.8 * clr * clr) * dScale;
          const clearDz = isDownwardEject ? 0 : ejectZ * 4.6 * dScale * clr;
          pGrp.position.set(
            cx - (0.24 + 2.4 * clr) * dScale,
            cy + clearDy,
            cz + clearDz
          );
          pGrp.rotation.set(clr * 1.6, clr * ejectZ * 1.4, clr * 2.2);

          if (primaryBulletRef.current) primaryBulletRef.current.visible = false;
          if (primaryLivePrimerRef.current)
            primaryLivePrimerRef.current.visible = false;
          if (primaryStruckGroupRef.current)
            primaryStruckGroupRef.current.visible = true;
          if (primaryDiagRingRef.current)
            primaryDiagRingRef.current.visible = false;
        } else if (vis.kind === 'light_strike') {
          // Intact unfired live round in chamber with shallow primer dimple
          const clearDy = isDownwardEject
            ? -5.2 * dScale * clr * clr
            : (2.1 * clr - 3.4 * clr * clr) * dScale;
          const clearDz = isDownwardEject ? 0 : ejectZ * 4.9 * dScale * clr;
          pGrp.position.set(cx - 2.1 * dScale * clr, cy + clearDy, cz + clearDz);
          pGrp.rotation.set(clr * 1.3, clr * ejectZ * 1.8, clr * 2.5);

          if (primaryBulletRef.current) primaryBulletRef.current.visible = true;
          if (primaryLivePrimerRef.current)
            primaryLivePrimerRef.current.visible = false;
          if (primaryStruckGroupRef.current)
            primaryStruckGroupRef.current.visible = true;
          if (primaryDiagRingRef.current) {
            primaryDiagRingRef.current.visible = clr < 0.15;
            primaryDiagRingRef.current.position.set(xHead - 0.025 * dScale, 0, 0);
            primaryDiagRingRef.current.scale.setScalar(
              (0.92 + 0.18 * pulse) * (isTank ? 12 : 1)
            );
          }
          if (primaryDiagRingMatRef.current) {
            primaryDiagRingMatRef.current.color.setHex(0xf59e0b);
            primaryDiagRingMatRef.current.opacity = 0.55 + 0.4 * pulse;
          }
        } else {
          // out_of_battery: bulged live round protruding ~4.2mm rearward of chamber shoulder
          const clearDy = isDownwardEject
            ? -5.0 * dScale * clr * clr
            : (1.9 * clr - 3.5 * clr * clr) * dScale;
          const clearDz = isDownwardEject ? 0 : ejectZ * 4.5 * dScale * clr;
          pGrp.position.set(
            cx - (0.48 + 2.2 * clr) * dScale,
            cy + clearDy,
            cz + clearDz
          );
          pGrp.rotation.set(clr * 1.4, clr * ejectZ * 1.5, 0.03 + clr * 2.0);

          if (primaryBulletRef.current) primaryBulletRef.current.visible = true;
          if (primaryLivePrimerRef.current)
            primaryLivePrimerRef.current.visible = true;
          if (primaryStruckGroupRef.current)
            primaryStruckGroupRef.current.visible = false;
          if (primaryDiagRingRef.current)
            primaryDiagRingRef.current.visible = false;
        }
      }
    }

    // 2. Wedged 2nd Live Cartridge (Type-3 Double-Feed / Revolver Bullet-Jump Bind)
    const secGrp = secondRoundGroupRef.current;
    if (secGrp) {
      const drop = vis.secondRoundDropAlpha;
      const showSecond = vis.kind === 'double_feed' && drop < 0.995;
      secGrp.visible = showSecond;
      if (showSecond) {
        if (weaponId === 'python') {
          // Recoil crimp-jumped .357 round protruding forward out of adjacent chamber into forcing cone
          secGrp.position.set(
            0.95 - 2.4 * drop,
            1.76 - 2.2 * drop * drop,
            -1.02 - 2.6 * drop
          );
          secGrp.rotation.set(0.2 * drop, -0.25 * drop, 0.04 * (1 - drop));
          secGrp.scale.setScalar(Math.max(0.01, fit.roundScale * (1 - 0.12 * drop)));
        } else {
          const isTopFeed =
            prof.magStripOffsetCm[1] > 0 || weaponId === 'm249';
          const wedgeY =
            weaponId === 'm249'
              ? cy + 0.36
              : isTopFeed
                ? cy + 0.72 * dScale
                : cy - 0.68 * dScale;
          const dropDy = isTopFeed
            ? 4.2 * dScale * drop * drop
            : -5.8 * dScale * drop * drop;
          const dropDz = weaponId === 'm249' ? -3.4 * drop : 0;
          const pitchZ = isTopFeed ? -0.38 : 0.42;
          secGrp.position.set(
            cx - (1.95 + 0.45 * drop) * dScale,
            wedgeY + dropDy,
            cz + 0.06 * dScale + dropDz
          );
          secGrp.rotation.set(drop * 0.7, 0.05, pitchZ * (1 - 0.5 * drop));
          secGrp.scale.setScalar(Math.max(0.01, fit.roundScale * (1 - 0.12 * drop)));
        }
      }
    }

    // 3. Breech-Face Headspace Collar (Crimson/Amber OOB Warning -> Emerald Cleared Lockup)
    const collar = oobCollarRef.current;
    const collarMat = oobCollarMatRef.current;
    if (collar && collarMat) {
      const showOobGap =
        vis.kind === 'out_of_battery' && vis.caseClearAlpha < 0.35;
      const showClearedRing = vis.cleared && vis.freshChamberAlpha > 0.5;
      collar.visible = showOobGap || showClearedRing;
      const collarScale = isTank ? 16 : fit.roundScale;
      if (showOobGap) {
        collar.position.set(cx - 0.95 * dScale, cy, cz);
        collar.scale.setScalar(collarScale * (0.95 + 0.12 * pulse));
        collarMat.color.setHex(0xef4444);
        collarMat.opacity = 0.48 + 0.42 * pulse;
      } else if (showClearedRing) {
        collar.position.set(cx - 0.62 * dScale, cy, cz);
        collar.scale.setScalar(collarScale * 0.88);
        collarMat.color.setHex(0x10b981);
        collarMat.opacity = 0.42;
      }
    }

    // 4. Fresh Round Chambered in Full Battery once Clearing Drill Completes
    const freshGrp = freshRoundGroupRef.current;
    if (freshGrp) {
      const fa = vis.freshChamberAlpha;
      freshGrp.visible = fa > 0.02;
      if (fa > 0.02) {
        freshGrp.position.set(cx - (1 - fa) * 1.4 * dScale, cy, cz);
        freshGrp.rotation.set(0, 0, 0);
        freshGrp.scale.setScalar(fit.roundScale);
      }
    }
  });

  if (screen !== 'workbench' || !malfunctionActive) {
    return null;
  }

  if (isArchery) {
    return (
      <group>
        {/* 1. Primary Obstructed / Pinched Carbon Arrow or Crossbow Bolt */}
        <group ref={primaryGroupRef} position={manifest.workbenchMeta.chamberGlowPos}>
          <mesh geometry={ARCHERY_SHAFT_GEO} renderOrder={4}>
            <meshStandardMaterial
              color="#1e293b"
              metalness={0.22}
              roughness={0.44}
              emissive="#f59e0b"
              emissiveIntensity={0.22}
            />
          </mesh>
          <mesh geometry={ARCHERY_BROADHEAD_GEO} renderOrder={4}>
            <meshStandardMaterial
              color="#e2e8f0"
              metalness={0.86}
              roughness={0.22}
            />
          </mesh>
          <mesh geometry={ARCHERY_VANES_GEO} renderOrder={4}>
            <meshStandardMaterial
              color="#f97316"
              metalness={0.08}
              roughness={0.48}
            />
          </mesh>
          <mesh geometry={ARCHERY_NOCK_GEO} renderOrder={4}>
            <meshStandardMaterial
              color="#22d3ee"
              metalness={0.18}
              roughness={0.32}
              emissive="#f59e0b"
              emissiveIntensity={0.35}
            />
          </mesh>
          <mesh
            ref={primaryDiagRingRef}
            geometry={ARCHERY_DIAG_RING_GEO}
            visible={false}
            renderOrder={14}
          >
            <meshBasicMaterial
              ref={primaryDiagRingMatRef}
              color="#f59e0b"
              transparent
              opacity={0.82}
              depthTest={false}
            />
          </mesh>
        </group>

        {/* 2. Intrusive Side-Quiver Backup Carbon Arrow / Bolt (Nock-Pinch Drill) */}
        <group ref={secondRoundGroupRef} visible={false}>
          <mesh geometry={ARCHERY_SHAFT_GEO} renderOrder={3}>
            <meshStandardMaterial
              color="#0f172a"
              metalness={0.2}
              roughness={0.46}
              emissive="#ef4444"
              emissiveIntensity={0.25}
            />
          </mesh>
          <mesh geometry={ARCHERY_BROADHEAD_GEO} renderOrder={3}>
            <meshStandardMaterial
              color="#cbd5e1"
              metalness={0.84}
              roughness={0.24}
            />
          </mesh>
          <mesh geometry={ARCHERY_VANES_GEO} renderOrder={3}>
            <meshStandardMaterial
              color="#f97316"
              metalness={0.08}
              roughness={0.5}
            />
          </mesh>
          <mesh geometry={ARCHERY_NOCK_GEO} renderOrder={3}>
            <meshStandardMaterial
              color="#ef4444"
              metalness={0.15}
              roughness={0.38}
            />
          </mesh>
        </group>

        {/* 3. Anti-Dry-Fire / Cam Track Diagnostic Warning Collar */}
        <mesh
          ref={oobCollarRef}
          geometry={OOB_GAP_COLLAR_GEO}
          visible={false}
          renderOrder={14}
        >
          <meshBasicMaterial
            ref={oobCollarMatRef}
            color="#ef4444"
            transparent
            opacity={0.78}
            depthTest={false}
          />
        </mesh>

        {/* 4. Fresh Seated Carbon Arrow / Bolt Upon Clearing Completion */}
        <group ref={freshRoundGroupRef} visible={false}>
          <mesh geometry={ARCHERY_SHAFT_GEO} renderOrder={3}>
            <meshStandardMaterial
              color="#1e293b"
              metalness={0.24}
              roughness={0.4}
              emissive="#10b981"
              emissiveIntensity={0.18}
            />
          </mesh>
          <mesh geometry={ARCHERY_BROADHEAD_GEO} renderOrder={3}>
            <meshStandardMaterial
              color="#e2e8f0"
              metalness={0.88}
              roughness={0.2}
            />
          </mesh>
          <mesh geometry={ARCHERY_VANES_GEO} renderOrder={3}>
            <meshStandardMaterial
              color="#22d3ee"
              metalness={0.1}
              roughness={0.45}
            />
          </mesh>
          <mesh geometry={ARCHERY_NOCK_GEO} renderOrder={3}>
            <meshStandardMaterial
              color="#10b981"
              metalness={0.2}
              roughness={0.3}
            />
          </mesh>
        </group>
      </group>
    );
  }

  return (
    <group>
      {/* 1. Primary Jammed Brass / Misfired Cartridge */}
      <group
        ref={primaryGroupRef}
        position={manifest.workbenchMeta.chamberGlowPos}
        scale={roundFit.roundScale}
      >
        <mesh key={`malf-p-case-${caliberProfile}`} geometry={caseGeo} renderOrder={3}>
          <meshStandardMaterial
            color={useMultiToneCartridge ? '#ffffff' : calSpec.caseColor}
            vertexColors={useMultiToneCartridge}
            metalness={caliberProfile === '12_gauge' ? 0.35 : 0.86}
            roughness={caliberProfile === '12_gauge' ? 0.42 : 0.23}
            emissive="#f59e0b"
            emissiveIntensity={0.08}
          />
        </mesh>
        <mesh
          key={`malf-p-bullet-${caliberProfile}`}
          ref={primaryBulletRef}
          geometry={bulletGeo}
          position={[calSpec.bulletLocalOffset, 0, 0]}
          renderOrder={3}
        >
          <meshStandardMaterial
            color={useMultiToneCartridge ? '#ffffff' : calSpec.bulletColor}
            vertexColors={useMultiToneCartridge}
            metalness={caliberProfile === '12_gauge' ? 0.48 : 0.84}
            roughness={caliberProfile === '12_gauge' ? 0.34 : 0.24}
          />
        </mesh>
        <mesh ref={primaryLivePrimerRef} geometry={livePrimerGeo} renderOrder={3}>
          <meshStandardMaterial
            color={calSpec.primerColor}
            metalness={0.92}
            roughness={0.18}
          />
        </mesh>
        <group ref={primaryStruckGroupRef}>
          <mesh geometry={spentPrimerGeo} renderOrder={3}>
            <meshStandardMaterial
              color="#cbd5e1"
              metalness={0.88}
              roughness={0.26}
            />
          </mesh>
          <mesh geometry={sootRingGeo} renderOrder={4}>
            <meshStandardMaterial
              color="#1c1917"
              metalness={0.08}
              roughness={0.92}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
        </group>
        <mesh
          ref={primaryDiagRingRef}
          geometry={PRIMER_DIAG_RING_GEO}
          visible={false}
          renderOrder={14}
        >
          <meshBasicMaterial
            ref={primaryDiagRingMatRef}
            color="#f59e0b"
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
            depthTest={false}
          />
        </mesh>
      </group>

      {/* 2. Wedged 2nd Live Round (Double-Feed Stoppage) */}
      <group
        ref={secondRoundGroupRef}
        visible={false}
        scale={roundFit.roundScale}
      >
        <mesh key={`malf-s-case-${caliberProfile}`} geometry={caseGeo} renderOrder={3}>
          <meshStandardMaterial
            color={useMultiToneCartridge ? '#ffffff' : calSpec.caseColor}
            vertexColors={useMultiToneCartridge}
            metalness={caliberProfile === '12_gauge' ? 0.35 : 0.86}
            roughness={caliberProfile === '12_gauge' ? 0.42 : 0.22}
            emissive="#ef4444"
            emissiveIntensity={0.12}
          />
        </mesh>
        <mesh
          key={`malf-s-bullet-${caliberProfile}`}
          geometry={bulletGeo}
          position={[calSpec.bulletLocalOffset, 0, 0]}
          renderOrder={3}
        >
          <meshStandardMaterial
            color={useMultiToneCartridge ? '#ffffff' : calSpec.bulletColor}
            vertexColors={useMultiToneCartridge}
            metalness={caliberProfile === '12_gauge' ? 0.48 : 0.85}
            roughness={caliberProfile === '12_gauge' ? 0.34 : 0.22}
            emissive="#ef4444"
            emissiveIntensity={0.1}
          />
        </mesh>
        <mesh geometry={livePrimerGeo} renderOrder={3}>
          <meshStandardMaterial
            color={calSpec.primerColor}
            metalness={0.92}
            roughness={0.18}
          />
        </mesh>
      </group>

      {/* 3. Out-of-Battery Unlocked Headspace Gap Collar */}
      <mesh
        ref={oobCollarRef}
        geometry={OOB_GAP_COLLAR_GEO}
        visible={false}
        renderOrder={14}
      >
        <meshBasicMaterial
          ref={oobCollarMatRef}
          color="#ef4444"
          transparent
          opacity={0.75}
          depthTest={false}
        />
      </mesh>

      {/* 4. Fresh Chambered Round Upon Successful Clearing */}
      <group
        ref={freshRoundGroupRef}
        visible={false}
        scale={roundFit.roundScale}
      >
        <mesh key={`malf-f-case-${caliberProfile}`} geometry={caseGeo} renderOrder={3}>
          <meshStandardMaterial
            color={useMultiToneCartridge ? '#ffffff' : calSpec.caseColor}
            vertexColors={useMultiToneCartridge}
            metalness={caliberProfile === '12_gauge' ? 0.35 : 0.88}
            roughness={caliberProfile === '12_gauge' ? 0.4 : 0.19}
            emissive="#10b981"
            emissiveIntensity={0.08}
          />
        </mesh>
        <mesh
          key={`malf-f-bullet-${caliberProfile}`}
          geometry={bulletGeo}
          position={[calSpec.bulletLocalOffset, 0, 0]}
          renderOrder={3}
        >
          <meshStandardMaterial
            color={useMultiToneCartridge ? '#ffffff' : calSpec.bulletColor}
            vertexColors={useMultiToneCartridge}
            metalness={caliberProfile === '12_gauge' ? 0.48 : 0.86}
            roughness={caliberProfile === '12_gauge' ? 0.34 : 0.2}
          />
        </mesh>
        <mesh geometry={livePrimerGeo} renderOrder={3}>
          <meshStandardMaterial
            color={calSpec.primerColor}
            metalness={0.92}
            roughness={0.17}
          />
        </mesh>
      </group>
    </group>
  );
};

MalfunctionActor.displayName = 'MalfunctionActor';
