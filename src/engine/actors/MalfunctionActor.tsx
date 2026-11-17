import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { getLoadedWeaponPlugin } from '../../weapons/registry';
import { WEAPON_MALFUNCTION_PROFILES } from '../malfunctions/malfunctionSpecs';
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
  const calSpec = CALIBER_VISUAL_SPECS[caliberProfile];
  const roundFit = WEAPON_ROUND_FIT[activeWeaponId];

  const { caseGeo, bulletGeo, livePrimerGeo, spentPrimerGeo, sootRingGeo, xHead } =
    useMemo(() => getCaliberGeometries(caliberProfile), [caliberProfile]);

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
    const curManifest = getWeaponManifest(weaponId);
    const meta = curManifest.workbenchMeta;
    const fit = WEAPON_ROUND_FIT[weaponId];
    const prof = WEAPON_MALFUNCTION_PROFILES[weaponId];
    const plugin = getLoadedWeaponPlugin(weaponId);
    const timing = getWeaponFiringTiming(weaponId);
    const nowSec = performance.now() * 0.001;
    const pulse = 0.5 + 0.5 * Math.sin(nowSec * 6.5);

    const cx = meta.chamberGlowPos[0];
    const cy = meta.chamberGlowPos[1];
    const cz = meta.chamberGlowPos[2];
    const isDownwardEject = prof.ejectionUpSign < 0;
    const ejectZ = 1;

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
          // Empty spent brass pinched upright ~82° in the ejection port
          const basePx = ejectSample ? ejectSample.spentCasePos[0] : cx - 0.95;
          const basePy = isDownwardEject ? cy - 1.15 : cy + 0.88;
          const basePz = isDownwardEject ? cz : cz + ejectZ * 0.56;

          const clearDx = -1.6 * clr;
          const clearDy = isDownwardEject
            ? -5.4 * clr * clr
            : 2.2 * clr - 3.6 * clr * clr;
          const clearDz = isDownwardEject ? 0.6 * clr : ejectZ * 4.8 * clr;

          pGrp.position.set(basePx + clearDx, basePy + clearDy, basePz + clearDz);
          pGrp.rotation.set(
            clr * 2.4,
            ejectZ * 0.28 + clr * 1.9,
            (isDownwardEject ? -1.42 : 1.38) + clr * 3.1
          );

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
            ? -5.5 * clr * clr
            : 1.8 * clr - 3.8 * clr * clr;
          const clearDz = isDownwardEject ? 0 : ejectZ * 4.6 * clr;
          pGrp.position.set(cx - 0.24 - 2.4 * clr, cy + clearDy, cz + clearDz);
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
            ? -5.2 * clr * clr
            : 2.1 * clr - 3.4 * clr * clr;
          const clearDz = isDownwardEject ? 0 : ejectZ * 4.9 * clr;
          pGrp.position.set(cx - 2.1 * clr, cy + clearDy, cz + clearDz);
          pGrp.rotation.set(clr * 1.3, clr * ejectZ * 1.8, clr * 2.5);

          if (primaryBulletRef.current) primaryBulletRef.current.visible = true;
          if (primaryLivePrimerRef.current)
            primaryLivePrimerRef.current.visible = false;
          if (primaryStruckGroupRef.current)
            primaryStruckGroupRef.current.visible = true;
          if (primaryDiagRingRef.current) {
            primaryDiagRingRef.current.visible = clr < 0.15;
            primaryDiagRingRef.current.position.set(xHead - 0.025, 0, 0);
            primaryDiagRingRef.current.scale.setScalar(0.92 + 0.18 * pulse);
          }
          if (primaryDiagRingMatRef.current) {
            primaryDiagRingMatRef.current.color.setHex(0xf59e0b);
            primaryDiagRingMatRef.current.opacity = 0.55 + 0.4 * pulse;
          }
        } else {
          // out_of_battery: bulged live round protruding ~4.2mm rearward of chamber shoulder
          const clearDy = isDownwardEject
            ? -5.0 * clr * clr
            : 1.9 * clr - 3.5 * clr * clr;
          const clearDz = isDownwardEject ? 0 : ejectZ * 4.5 * clr;
          pGrp.position.set(cx - 0.48 - 2.2 * clr, cy + clearDy, cz + clearDz);
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

    // 2. Wedged 2nd Live Cartridge (Type-3 Double-Feed only)
    const secGrp = secondRoundGroupRef.current;
    if (secGrp) {
      const drop = vis.secondRoundDropAlpha;
      const showSecond = vis.kind === 'double_feed' && drop < 0.995;
      secGrp.visible = showSecond;
      if (showSecond) {
        const isTopFeed = prof.magStripOffsetCm[1] > 0;
        const wedgeY = isTopFeed ? cy + 0.72 : cy - 0.68;
        const dropDy = isTopFeed ? 4.2 * drop * drop : -5.8 * drop * drop;
        const pitchZ = isTopFeed ? -0.38 : 0.42;
        secGrp.position.set(
          cx - 1.95 - 0.45 * drop,
          wedgeY + dropDy,
          cz + 0.06
        );
        secGrp.rotation.set(drop * 0.7, 0.05, pitchZ * (1 - 0.5 * drop));
        secGrp.scale.setScalar(Math.max(0.01, fit.roundScale * (1 - 0.12 * drop)));
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
      if (showOobGap) {
        collar.position.set(cx - 0.95, cy, cz);
        collar.scale.setScalar(fit.roundScale * (0.95 + 0.12 * pulse));
        collarMat.color.setHex(0xef4444);
        collarMat.opacity = 0.48 + 0.42 * pulse;
      } else if (showClearedRing) {
        collar.position.set(cx - 0.62, cy, cz);
        collar.scale.setScalar(fit.roundScale * 0.88);
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
        freshGrp.position.set(cx - (1 - fa) * 1.4, cy, cz);
        freshGrp.rotation.set(0, 0, 0);
        freshGrp.scale.setScalar(fit.roundScale);
      }
    }
  });

  if (screen !== 'workbench' || !malfunctionActive) {
    return null;
  }

  return (
    <group>
      {/* 1. Primary Jammed Brass / Misfired Cartridge */}
      <group
        ref={primaryGroupRef}
        position={manifest.workbenchMeta.chamberGlowPos}
        scale={roundFit.roundScale}
      >
        <mesh geometry={caseGeo} renderOrder={3}>
          <meshStandardMaterial
            color={calSpec.caseColor}
            metalness={0.86}
            roughness={0.23}
            emissive="#f59e0b"
            emissiveIntensity={0.08}
          />
        </mesh>
        <mesh
          ref={primaryBulletRef}
          geometry={bulletGeo}
          position={[calSpec.bulletLocalOffset, 0, 0]}
          renderOrder={3}
        >
          <meshStandardMaterial
            color={calSpec.bulletColor}
            metalness={0.84}
            roughness={0.24}
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
        <mesh geometry={caseGeo} renderOrder={3}>
          <meshStandardMaterial
            color={calSpec.caseColor}
            metalness={0.86}
            roughness={0.22}
            emissive="#ef4444"
            emissiveIntensity={0.12}
          />
        </mesh>
        <mesh
          geometry={bulletGeo}
          position={[calSpec.bulletLocalOffset, 0, 0]}
          renderOrder={3}
        >
          <meshStandardMaterial
            color={calSpec.bulletColor}
            metalness={0.85}
            roughness={0.22}
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
        <mesh geometry={caseGeo} renderOrder={3}>
          <meshStandardMaterial
            color={calSpec.caseColor}
            metalness={0.88}
            roughness={0.19}
            emissive="#10b981"
            emissiveIntensity={0.08}
          />
        </mesh>
        <mesh
          geometry={bulletGeo}
          position={[calSpec.bulletLocalOffset, 0, 0]}
          renderOrder={3}
        >
          <meshStandardMaterial
            color={calSpec.bulletColor}
            metalness={0.86}
            roughness={0.2}
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
