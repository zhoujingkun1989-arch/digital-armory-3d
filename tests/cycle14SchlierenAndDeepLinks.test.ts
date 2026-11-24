import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLocationToStore,
  buildSearchString,
  parseExplodeUrlParam,
  serializeExplodeUrlParam,
} from '../src/app/useUrlStateSync';
import {
  PORTRAIT_PHONE_DISTANCE_MULT,
  PORTRAIT_PHONE_LONG_RIFLE_EXTRA_MULT,
  PORTRAIT_PHONE_LONG_RIFLE_IDS,
  computePortraitPhoneDistanceMultiplier,
} from '../src/engine/canvas/ArmoryViewport';
import { playbackClock } from '../src/engine/clock/playbackClock';
import {
  SCHLIEREN_MACH_LIP_FLIR_OPACITY_SCALE,
  SCHLIEREN_MACH_LIP_OPACITY_SCALE,
  SCHLIEREN_MACH_OUTER_FLIR_OPACITY_SCALE,
  SCHLIEREN_MACH_OUTER_OPACITY_SCALE,
  SCHLIEREN_MACH_PEAK_ALPHA_CAP,
  computeSchlierenMachConeOpacities,
} from '../src/features/ballistics/Range3DScene';
import { computeMachConeState } from '../src/features/ballistics/range3DMath';
import { useAppStore } from '../src/store/useAppStore';
import type { WeaponId } from '../src/weapons/types';

const ROOT = path.resolve(__dirname, '..');

afterEach(() => {
  playbackClock.setTargetProgress(0, true);
  playbackClock.setFireProgress(0, true);
  useAppStore.getState().closePosterModal();
  useAppStore.getState().setLang('zh');
  useAppStore.getState().resetAll();
  useAppStore.getState().returnToArmory();
});

describe('Cycle 14A — Schlieren Mach-Cone Optics, Portrait Long-Rifle Margin & Deep-Link Polish', () => {
  describe('1. Schlieren-grade 3D Mach-Cone translucency & Zero-GC shader hygiene', () => {
    it('softens outer & lip peak opacity by ~33-35% vs legacy fog and caps strictly beneath 0.28', () => {
      // Legacy scales were 0.78 (outer) and 1.05 (lip) -> 33%+ reduction check
      expect(SCHLIEREN_MACH_OUTER_OPACITY_SCALE).toBeLessThanOrEqual(0.55);
      expect(SCHLIEREN_MACH_LIP_OPACITY_SCALE).toBeLessThanOrEqual(0.72);
      expect(SCHLIEREN_MACH_OUTER_FLIR_OPACITY_SCALE).toBeLessThanOrEqual(0.68);
      expect(SCHLIEREN_MACH_LIP_FLIR_OPACITY_SCALE).toBeLessThanOrEqual(0.8);
      expect(SCHLIEREN_MACH_PEAK_ALPHA_CAP).toBeLessThanOrEqual(0.28);

      for (const mach of [1.08, 1.5, 2.4, 3.5, 5.0]) {
        const cone = computeMachConeState(mach, false);
        expect(cone.visible).toBe(true);

        const std = computeSchlierenMachConeOpacities(cone.opacity, false);
        const flir = computeSchlierenMachConeOpacities(cone.opacity, true);

        expect(std.outerOpacity).toBeGreaterThan(0);
        expect(std.outerOpacity).toBeLessThanOrEqual(
          SCHLIEREN_MACH_PEAK_ALPHA_CAP
        );
        expect(std.lipOpacity).toBeGreaterThan(std.outerOpacity);
        expect(std.lipOpacity).toBeLessThanOrEqual(
          SCHLIEREN_MACH_PEAK_ALPHA_CAP
        );

        expect(flir.outerOpacity).toBeLessThanOrEqual(
          SCHLIEREN_MACH_PEAK_ALPHA_CAP
        );
        expect(flir.lipOpacity).toBeLessThanOrEqual(
          SCHLIEREN_MACH_PEAK_ALPHA_CAP
        );
      }

      // Extreme / malformed inputs clamp cleanly into [0, SCHLIEREN_MACH_PEAK_ALPHA_CAP]
      expect(computeSchlierenMachConeOpacities(1.0, true)).toEqual({
        outerOpacity: SCHLIEREN_MACH_PEAK_ALPHA_CAP,
        lipOpacity: SCHLIEREN_MACH_PEAK_ALPHA_CAP,
      });
      expect(computeSchlierenMachConeOpacities(-0.5, false)).toEqual({
        outerOpacity: 0,
        lipOpacity: 0,
      });
      expect(computeSchlierenMachConeOpacities(Number.NaN, false)).toEqual({
        outerOpacity: 0,
        lipOpacity: 0,
      });
    });

    it('uses Fresnel Schlieren ShaderMaterial with valid GLSL smoothstep ordering, GPU disposal, and Zero-GC useFrame', () => {
      const src = fs.readFileSync(
        path.join(ROOT, 'src/features/ballistics/Range3DScene.tsx'),
        'utf8'
      );
      expect(src).toContain('SCHLIEREN_MACH_CONE_FRAG');
      expect(src).toContain('createSchlierenMachMaterial');
      expect(src).toContain('smoothstep(uNoseSoften, 1.0, vUv.y)');
      expect(src).not.toContain('smoothstep(1.0, uNoseSoften');
      expect(src).toContain('machConeAssets.outerGeo.dispose()');
      expect(src).toContain('machConeAssets.lipGeo.dispose()');
      expect(src).toContain('machConeAssets.outerMat.dispose()');
      expect(src).toContain('machConeAssets.lipMat.dispose()');

      // Zero `new THREE.` inside ProjectileVisualMesh useFrame
      const projIdx = src.indexOf('const ProjectileVisualMesh');
      expect(projIdx).toBeGreaterThan(-1);
      const frameStart = src.indexOf('useFrame(() => {', projIdx);
      expect(frameStart).toBeGreaterThan(projIdx);
      const frameEnd = src.indexOf('  return (\n    <group ref={rootRef}>', frameStart);
      expect(frameEnd).toBeGreaterThan(frameStart);
      const useFrameBody = src.slice(frameStart, frameEnd);
      expect(useFrameBody).not.toMatch(/\bnew\s+THREE\./);
      expect(useFrameBody).toContain('outerMat.uniforms.uOpacity.value');
      expect(useFrameBody).toContain('lipMat.uniforms.uOpacity.value');
    });
  });

  describe('2. Portrait phone long-rifle margin (ArmoryViewport)', () => {
    it('applies extra +6.5% (~1.374x) pull-back for long rifles on portrait phones while keeping desktop/tablet at 1.0', () => {
      const phoneAspect = 390 / 844;
      expect(PORTRAIT_PHONE_LONG_RIFLE_EXTRA_MULT).toBeGreaterThanOrEqual(1.05);

      // Backward-compatible call without weaponId keeps base 1.29x
      expect(computePortraitPhoneDistanceMultiplier(phoneAspect)).toBe(
        PORTRAIT_PHONE_DISTANCE_MULT
      );

      // Required long rifles clear the right edge with >= 1.35x multiplier on 390x844
      const requiredLongRifles: readonly WeaponId[] = [
        'ak15',
        'm4a1',
        'k98k',
        'garand',
        'm82a1',
        'awm',
        'mg42',
        'scar',
        'benellim4',
        'rem870',
        'winchester1894',
        'vss',
        'an94',
      ];
      for (const id of requiredLongRifles) {
        expect(PORTRAIT_PHONE_LONG_RIFLE_IDS.has(id)).toBe(true);
        const mult = computePortraitPhoneDistanceMultiplier(phoneAspect, id);
        expect(mult).toBeGreaterThanOrEqual(1.35);
        expect(mult).toBeGreaterThan(PORTRAIT_PHONE_DISTANCE_MULT);
        expect(mult).toBeLessThanOrEqual(1.42);
        // Desktop & tablet remain strictly untouched at 1.0
        expect(computePortraitPhoneDistanceMultiplier(1920 / 1080, id)).toBe(
          1.0
        );
        expect(computePortraitPhoneDistanceMultiplier(1440 / 900, id)).toBe(
          1.0
        );
        expect(computePortraitPhoneDistanceMultiplier(1024 / 768, id)).toBe(
          1.0
        );
        expect(computePortraitPhoneDistanceMultiplier(768 / 1024, id)).toBe(
          1.0
        );
      }

      // Compact pistols & SMGs keep standard portrait multiplier (1.29x)
      for (const compactId of ['g17', 'p08', 'm1911', 'mp5', 'p90'] as const) {
        expect(computePortraitPhoneDistanceMultiplier(phoneAspect, compactId)).toBe(
          PORTRAIT_PHONE_DISTANCE_MULT
        );
      }

      // Non-finite / non-positive aspect guards cleanly return 1.0
      expect(computePortraitPhoneDistanceMultiplier(0, 'ak15')).toBe(1.0);
      expect(computePortraitPhoneDistanceMultiplier(-0.5, 'ak15')).toBe(1.0);
      expect(computePortraitPhoneDistanceMultiplier(Number.NaN, 'ak15')).toBe(
        1.0
      );
    });
  });

  describe('3. ?panel=poster and ?explode=<0..1> deep-link hydration & serialization', () => {
    it('hydrates and serializes ?panel=poster cleanly across open & close transitions', () => {
      applyLocationToStore('?weapon=ak15&panel=poster&lang=en');
      let st = useAppStore.getState();
      expect(st.posterShareModalOpen).toBe(true);
      expect(st.posterShareOptions?.weaponId).toBe('ak15');
      expect(st.lang).toBe('en');

      const openQs = buildSearchString(
        'ak15',
        'workbench',
        'explode',
        false,
        'en',
        '556_nato',
        true,
        '556_nato',
        '',
        undefined,
        undefined,
        false,
        false,
        'tactical_vault',
        true
      );
      expect(new URLSearchParams(openQs).get('panel')).toBe('poster');

      const closedQs = buildSearchString(
        'ak15',
        'workbench',
        'explode',
        false,
        'en',
        '556_nato',
        true,
        '556_nato',
        openQs,
        undefined,
        undefined,
        false,
        false,
        'tactical_vault',
        false
      );
      expect(new URLSearchParams(closedQs).has('panel')).toBe(false);

      // Navigating to a URL without ?panel=poster closes the modal
      applyLocationToStore('?screen=armory&weapon=ak15');
      st = useAppStore.getState();
      expect(st.posterShareModalOpen).toBe(false);
    });

    it('hydrates ?explode=<0..1> into playbackClock with strict [0, 1] clamping and omits default 0 from canonical URLs', () => {
      expect(parseExplodeUrlParam('1')).toBe(1);
      expect(parseExplodeUrlParam('0.65')).toBe(0.65);
      expect(parseExplodeUrlParam('0')).toBe(0);
      expect(parseExplodeUrlParam('1.85')).toBe(1);
      expect(parseExplodeUrlParam('-0.4')).toBe(0);
      expect(parseExplodeUrlParam('NaN')).toBeNull();
      expect(parseExplodeUrlParam('')).toBeNull();
      expect(parseExplodeUrlParam(null)).toBeNull();

      expect(serializeExplodeUrlParam(0)).toBeNull();
      expect(serializeExplodeUrlParam(0.002)).toBeNull();
      expect(serializeExplodeUrlParam(undefined)).toBeNull();
      expect(serializeExplodeUrlParam(Number.NaN)).toBeNull();
      expect(serializeExplodeUrlParam(0.65)).toBe('0.65');
      expect(serializeExplodeUrlParam(1)).toBe('1');
      expect(serializeExplodeUrlParam(1.5)).toBe('1');

      // Full exploded blueprint deep-link (?explode=1)
      applyLocationToStore(
        '?screen=workbench&weapon=ak15&explode=1&env=blueprint_daylight'
      );
      expect(useAppStore.getState().screen).toBe('workbench');
      expect(useAppStore.getState().mode).toBe('explode');
      expect(useAppStore.getState().environmentPreset).toBe(
        'blueprint_daylight'
      );
      expect(playbackClock.getState().targetProgress).toBe(1);
      expect(playbackClock.getState().animatedProgress).toBe(1);

      // Partial exploded state (?explode=0.65)
      applyLocationToStore('?screen=workbench&weapon=m4a1&explode=0.65');
      expect(useAppStore.getState().activeWeaponId).toBe('m4a1');
      expect(useAppStore.getState().mode).toBe('explode');
      expect(playbackClock.getState().targetProgress).toBeCloseTo(0.65, 3);
      expect(playbackClock.getState().animatedProgress).toBeCloseTo(0.65, 3);

      // Out-of-bounds clamping
      applyLocationToStore('?screen=workbench&weapon=ak15&explode=99');
      expect(playbackClock.getState().targetProgress).toBe(1);
      applyLocationToStore('?screen=workbench&weapon=ak15&explode=-5');
      expect(playbackClock.getState().targetProgress).toBe(0);

      // Serialization round-trip: non-zero emits ?explode=, zero omits it, firing/armory strips it
      const explodedUrl = buildSearchString(
        'ak15',
        'workbench',
        'explode',
        false,
        'en',
        '556_nato',
        true,
        '556_nato',
        '',
        undefined,
        { explodeProgress: 0.65 }
      );
      expect(new URLSearchParams(explodedUrl).get('explode')).toBe('0.65');

      const assembledUrl = buildSearchString(
        'ak15',
        'workbench',
        'explode',
        false,
        'en',
        '556_nato',
        true,
        '556_nato',
        explodedUrl,
        undefined,
        { explodeProgress: 0 }
      );
      expect(new URLSearchParams(assembledUrl).has('explode')).toBe(false);

      const firingUrl = buildSearchString(
        'ak15',
        'workbench',
        'firing',
        false,
        'en',
        '556_nato',
        true,
        '556_nato',
        explodedUrl,
        undefined,
        { explodeProgress: 0.65 }
      );
      expect(new URLSearchParams(firingUrl).has('explode')).toBe(false);

      const armoryUrl = buildSearchString(
        'ak15',
        'armory',
        'explode',
        false,
        'en',
        '556_nato',
        true,
        '556_nato',
        explodedUrl
      );
      expect(new URLSearchParams(armoryUrl).has('explode')).toBe(false);
    });
  });
});
