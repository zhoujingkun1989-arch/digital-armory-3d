import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  disposeGtaoPassResources,
  sampleRendererGpuTelemetry,
} from '../src/engine/canvas/ArmoryPostProcessing';
import {
  getGpuTelemetrySnapshot,
  isGpuTelemetryEnabled,
  resetGpuTelemetryBus,
  setGpuTelemetryEnabled,
} from '../src/engine/canvas/gpuTelemetryBus';
import {
  getGraphicsQualityTelemetryMeta,
  GRAPHICS_QUALITY_TIERS,
} from '../src/engine/canvas/graphicsQuality';
import {
  getTankGunnerOpticProfile,
  TANK_GUNNER_OPTIC_PROFILES,
  type TankWeaponId,
  useTankCrewStore,
} from '../src/engine/tank/tankCrewStore';
import {
  buildReelLowerThirdMeta,
  drawReelOverlayFrame,
} from '../src/features/video/directorReelRecorder';
import { DIRECTOR_REEL_STRINGS } from '../src/features/video/directorReelStrings';
import { TANK_CREW_STRINGS } from '../src/features/workbench/TankCrewHud';
import {
  EXHIBIT_DIRECTOR_PROFILES,
  getExhibitDirectorProfile,
  resolveDirectorBeat,
} from '../src/narration/storyDirector';
import type { WeaponNarrationBundle } from '../src/narration/types';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS } from '../src/weapons/types';

const REPO_ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

function assertBilingualZeroCjkEn(
  zhObj: Record<string, unknown>,
  enObj: Record<string, unknown>,
  prefix: string
): void {
  const zhKeys = Object.keys(zhObj).sort();
  const enKeys = Object.keys(enObj).sort();
  expect(enKeys, `${prefix} key parity`).toEqual(zhKeys);

  for (const key of zhKeys) {
    const zVal = zhObj[key];
    const eVal = enObj[key];
    if (typeof zVal === 'string') {
      expect(typeof eVal).toBe('string');
      expect(zVal.trim().length, `${prefix}.zh.${key} empty`).toBeGreaterThan(0);
      expect(
        (eVal as string).trim().length,
        `${prefix}.en.${key} empty`
      ).toBeGreaterThan(0);
      expect(
        CJK_RE.test(eVal as string),
        `CJK leak in ${prefix}.en.${key}: "${eVal}"`
      ).toBe(false);
    } else if (zVal && typeof zVal === 'object') {
      assertBilingualZeroCjkEn(
        zVal as Record<string, unknown>,
        eVal as Record<string, unknown>,
        `${prefix}.${key}`
      );
    }
  }
}

function createMockReelCanvas2DContext(): {
  ctx: CanvasRenderingContext2D;
  drawnTexts: string[];
  gradientCreateCount: () => number;
} {
  const drawnTexts: string[] = [];
  let gradCount = 0;
  const gradStub = { addColorStop: () => {} };

  const stub = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '12px monospace',
    textAlign: 'left',
    fillRect: () => {},
    strokeRect: () => {},
    drawImage: () => {},
    fillText: (text: string) => {
      drawnTexts.push(text);
    },
    createLinearGradient: () => {
      gradCount += 1;
      return gradStub;
    },
  };

  return {
    ctx: stub as unknown as CanvasRenderingContext2D,
    drawnTexts,
    gradientCreateCount: () => gradCount,
  };
}

afterEach(() => {
  resetGpuTelemetryBus();
  useTankCrewStore.getState().resetForWeapon('ztz99a');
});

describe('Cycle 3E — 4-Nation Main Battle Tank Gunner Reticles & FLIR Optics', () => {
  it('defines distinct nation-authentic optic profiles for all 4 MBTs and returns null for non-tanks', () => {
    const tanks: readonly TankWeaponId[] = [
      'ztz99a',
      'm1a2',
      'leopard2a7',
      'tiger1',
    ];
    const styles = new Set<string>();

    for (const id of tanks) {
      const profile = getTankGunnerOpticProfile(id);
      expect(profile).not.toBeNull();
      expect(TANK_GUNNER_OPTIC_PROFILES[id]).toBe(profile);
      styles.add(profile!.reticleStyle);

      expect(CJK_RE.test(profile!.designationEn)).toBe(false);
      expect(CJK_RE.test(profile!.readyLabelEn)).toBe(false);
      expect(profile!.supportedOpticModes.length).toBeGreaterThanOrEqual(2);
      expect(profile!.rangeDrumMaxM).toBe(4000);
    }

    expect(styles.size).toBe(4);
    expect(TANK_GUNNER_OPTIC_PROFILES.ztz99a.reticleStyle).toBe('pla_ztz99a');
    expect(TANK_GUNNER_OPTIC_PROFILES.ztz99a.ammoTag).toContain('APFSDS-125');

    expect(TANK_GUNNER_OPTIC_PROFILES.m1a2.reticleStyle).toBe('us_m1a2_gps');
    expect(TANK_GUNNER_OPTIC_PROFILES.m1a2.supportedOpticModes).toEqual([
      'flir_whot',
      'green_nvg',
      'daylight',
    ]);
    expect(TANK_GUNNER_OPTIC_PROFILES.m1a2.readyLabelEn).toBe('READY TO FIRE');

    expect(TANK_GUNNER_OPTIC_PROFILES.leopard2a7.reticleStyle).toBe('de_emes15');
    expect(TANK_GUNNER_OPTIC_PROFILES.leopard2a7.hasCantIndicator).toBe(true);

    expect(TANK_GUNNER_OPTIC_PROFILES.tiger1.reticleStyle).toBe('ww2_tzf9b');
    expect(TANK_GUNNER_OPTIC_PROFILES.tiger1.hasLaserRangefinder).toBe(false);
    expect(
      TANK_GUNNER_OPTIC_PROFILES.tiger1.museumStudyThermalNoteEn
    ).toBeTruthy();
    expect(
      CJK_RE.test(
        TANK_GUNNER_OPTIC_PROFILES.tiger1.museumStudyThermalNoteEn ?? ''
      )
    ).toBe(false);

    expect(getTankGunnerOpticProfile('ak15')).toBeNull();
    expect(getTankGunnerOpticProfile('gau8')).toBeNull();
  });

  it('cycles optical sight modes accurately per nation and supports 4000m range drum & cant readout', () => {
    const store = useTankCrewStore.getState();

    // Abrams GPS cycle: daylight -> flir_whot -> green_nvg -> daylight
    store.resetForWeapon('m1a2');
    expect(useTankCrewStore.getState().opticMode).toBe('daylight');
    useTankCrewStore.getState().cycleOpticMode('m1a2');
    expect(useTankCrewStore.getState().opticMode).toBe('flir_whot');
    useTankCrewStore.getState().cycleOpticMode('m1a2');
    expect(useTankCrewStore.getState().opticMode).toBe('green_nvg');
    useTankCrewStore.getState().cycleOpticMode('m1a2');
    expect(useTankCrewStore.getState().opticMode).toBe('daylight');

    // Tiger 131 cycle: daylight <-> optional museum FLIR study mode
    useTankCrewStore.getState().resetForWeapon('tiger1');
    useTankCrewStore.getState().cycleOpticMode('tiger1');
    expect(useTankCrewStore.getState().opticMode).toBe('flir_whot');
    useTankCrewStore.getState().cycleOpticMode('tiger1');
    expect(useTankCrewStore.getState().opticMode).toBe('daylight');

    // 0-4000m optical drum clamp & cant clamp
    useTankCrewStore.getState().setLrfRangeM(4000);
    expect(useTankCrewStore.getState().lrfRangeM).toBe(4000);
    useTankCrewStore.getState().setLrfRangeM(5500);
    expect(useTankCrewStore.getState().lrfRangeM).toBe(4000);
    useTankCrewStore.getState().setHullCantDeg(3.4);
    expect(useTankCrewStore.getState().hullCantDeg).toBe(3.4);
  });

  it('keeps TANK_CREW_STRINGS 100% bilingual with zero CJK in EN and zero internal WP-23 badge leak', () => {
    assertBilingualZeroCjkEn(
      TANK_CREW_STRINGS.zh as unknown as Record<string, unknown>,
      TANK_CREW_STRINGS.en as unknown as Record<string, unknown>,
      'TANK_CREW_STRINGS'
    );
    expect(TANK_CREW_STRINGS.zh.badge).not.toContain('WP-23');
    expect(TANK_CREW_STRINGS.en.badge).not.toContain('WP-23');

    const hudSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src', 'features', 'workbench', 'TankCrewHud.tsx'),
      'utf8'
    );
    expect(hudSrc).toContain('LASE / READY / APFSDS-125');
    expect(hudSrc).toContain('READY TO FIRE');
    expect(hudSrc).toContain('EMES-15');
    expect(hudSrc).toContain('CARL ZEISS TZF 9b');
    expect(hudSrc).toContain('tzf9b-center-triangle');
    expect(hudSrc).toContain('tzf9b-side-triangle');
  });
});

describe('Cycle 3E — 34/34 Story Director Choreography & Broadcast Director Reel', () => {
  it('resolves valid non-null focusPartIds & 0.25x firing beats across ALL 34 exhibits in both zh and en (fixing rem870 EN)', async () => {
    expect(WEAPON_IDS).toHaveLength(34);
    expect(Object.keys(EXHIBIT_DIRECTOR_PROFILES)).toHaveLength(34);

    for (const weaponId of WEAPON_IDS) {
      const profile = getExhibitDirectorProfile(weaponId);
      const plugin = await loadWeaponPlugin(weaponId);
      const validPartIds = new Set(plugin.parts.map((p) => p.id));

      for (const partId of profile.actFocusParts) {
        expect(
          validPartIds.has(partId),
          `${weaponId} profile actFocusPart "${partId}" missing in plugin`
        ).toBe(true);
      }
      for (const btId of profile.breakthroughParts) {
        expect(
          validPartIds.has(btId),
          `${weaponId} profile breakthroughPart "${btId}" missing in plugin`
        ).toBe(true);
      }

      const jsonPath = path.join(
        REPO_ROOT,
        'public',
        'narrations',
        `${weaponId}.json`
      );
      const bundle = JSON.parse(
        fs.readFileSync(jsonPath, 'utf8')
      ) as WeaponNarrationBundle;

      for (const lang of ['zh', 'en'] as const) {
        const story = bundle.story[lang];
        expect(story.acts).toHaveLength(4);

        for (let actIdx = 0; actIdx < story.acts.length; actIdx += 1) {
          const act = story.acts[actIdx];
          const beatA = resolveDirectorBeat(weaponId, story, act.id, 0.2);
          const beatB = resolveDirectorBeat(weaponId, story, act.id, 0.78);
          expect(beatA, `${weaponId}:${lang}:${act.id}:A`).not.toBeNull();
          expect(beatB, `${weaponId}:${lang}:${act.id}:B`).not.toBeNull();
          expect(CJK_RE.test(beatA!.stageBadgeEn)).toBe(false);
          expect(CJK_RE.test(beatB!.stageBadgeEn)).toBe(false);

          if (actIdx < 3) {
            expect(
              beatA!.stage.focusPartId,
              `${weaponId}:${lang}:${act.id} Beat A focusPartId`
            ).toBeTruthy();
            expect(
              validPartIds.has(beatA!.stage.focusPartId!),
              `${weaponId}:${lang}:${act.id} focusPartId "${beatA!.stage.focusPartId}" valid`
            ).toBe(true);
          } else {
            expect(beatA!.stage.mode).toBe('firing');
            expect(beatA!.stage.fireSpeedMultiplier).toBe(0.25);
            expect(beatA!.stage.xrayShells).toBe(true);
            expect(beatB!.stage.mode).toBe('firing');
            expect(beatB!.stage.sectionCut).toBe(true);
          }
        }
      }
    }
  }, 25_000);

  it('builds bilingual Broadcast Lower-Third metadata across all 34 exhibits with zero CJK in EN and zero per-frame gradient GC', () => {
    assertBilingualZeroCjkEn(
      DIRECTOR_REEL_STRINGS.zh as unknown as Record<string, unknown>,
      DIRECTOR_REEL_STRINGS.en as unknown as Record<string, unknown>,
      'DIRECTOR_REEL_STRINGS'
    );
    expect(DIRECTOR_REEL_STRINGS.zh.badge).not.toContain('WP-22');
    expect(DIRECTOR_REEL_STRINGS.en.badge).not.toContain('WP-22');

    for (const weaponId of WEAPON_IDS) {
      const zhMeta = buildReelLowerThirdMeta(weaponId, 'zh', {
        mode: 'firing',
        sectionCut: true,
      });
      const enMeta = buildReelLowerThirdMeta(weaponId, 'en', {
        mode: 'firing',
        sectionCut: true,
      });
      expect(zhMeta.weaponTitle.length).toBeGreaterThan(0);
      expect(zhMeta.caliberYearLine.length).toBeGreaterThan(0);
      expect(zhMeta.bayBadge.length).toBeGreaterThan(0);
      expect(zhMeta.phaseTag.length).toBeGreaterThan(0);
      expect(CJK_RE.test(enMeta.weaponTitle)).toBe(false);
      expect(CJK_RE.test(enMeta.caliberYearLine)).toBe(false);
      expect(CJK_RE.test(enMeta.bayBadge)).toBe(false);
      expect(CJK_RE.test(enMeta.phaseTag)).toBe(false);
      expect(CJK_RE.test(enMeta.watermarkText)).toBe(false);
    }

    // Verify drawReelOverlayFrame caches CanvasGradient objects across frames (Zero-GC)
    const { ctx, drawnTexts, gradientCreateCount } =
      createMockReelCanvas2DContext();
    const fakeSource = { width: 1920, height: 1080 } as HTMLCanvasElement;

    drawReelOverlayFrame(ctx, fakeSource, {
      targetWidth: 1920,
      targetHeight: 1080,
      weaponTitle: 'GAU-8/A Avenger',
      weaponMetaLine: '30x173mm · 1977',
      captionText: 'Seven-barrel hydraulic rotary cannon',
      telemetryLine: '1080p Widescreen (16:9)',
      lang: 'en',
      elapsedSec: 12.4,
      showLowerThird: true,
      bayBadge: 'HALL 09 · AERIAL ORDNANCE · GAU-8/A',
      phaseTag: 'CUTAWAY FIRING CYCLE',
      watermarkText: 'DIGITAL ARMORY 3D · MUSEUM ARCHIVE',
    });

    const gradsAfterFrame1 = gradientCreateCount();
    expect(gradsAfterFrame1).toBe(3);
    expect(drawnTexts).toContain('DIGITAL ARMORY 3D · MUSEUM ARCHIVE');
    expect(drawnTexts).toContain('REC 00:12.4');
    expect(drawnTexts).toContain('GAU-8/A Avenger');
    expect(drawnTexts).toContain('CUTAWAY FIRING CYCLE');

    // Second frame at identical resolution must reuse cached gradients (0 new allocations!)
    drawReelOverlayFrame(ctx, fakeSource, {
      targetWidth: 1920,
      targetHeight: 1080,
      weaponTitle: 'GAU-8/A Avenger',
      weaponMetaLine: '30x173mm · 1977',
      captionText: '',
      telemetryLine: '1080p Widescreen (16:9)',
      lang: 'en',
      elapsedSec: 12.5,
      showLowerThird: true,
      bayBadge: 'HALL 09 · AERIAL ORDNANCE · GAU-8/A',
      phaseTag: 'CUTAWAY FIRING CYCLE',
    });
    expect(gradientCreateCount()).toBe(gradsAfterFrame1);

    // Clean-feed mode (`showLowerThird: false`) must omit broadcast card & watermark
    drawnTexts.length = 0;
    drawReelOverlayFrame(ctx, fakeSource, {
      targetWidth: 1920,
      targetHeight: 1080,
      weaponTitle: 'GAU-8/A Avenger',
      weaponMetaLine: '30x173mm · 1977',
      captionText: '',
      telemetryLine: '1080p Widescreen (16:9)',
      lang: 'en',
      elapsedSec: 13.0,
      showLowerThird: false,
    });
    expect(drawnTexts).toHaveLength(0);
  });
});

describe('Cycle 3E — ArmoryPostProcessing Zero-Overhead GPU Telemetry Hook & Disposal Hygiene', () => {
  it('never touches gl.info when telemetry HUD is closed, and publishes live WebGL metrics when enabled', () => {
    expect(isGpuTelemetryEnabled()).toBe(false);
    const infoGetter = vi.fn(() => ({
      render: { calls: 74, triangles: 312_400 },
      memory: { geometries: 92, textures: 44 },
      programs: new Array(16),
    }));
    const mockGl = {} as Pick<THREE.WebGLRenderer, 'info'>;
    Object.defineProperty(mockGl, 'info', { get: infoGetter });

    // Closed telemetry -> strict 1-boolean no-op (zero gl.info reads)
    expect(sampleRendererGpuTelemetry(mockGl, 0.016)).toBe(false);
    expect(infoGetter).not.toHaveBeenCalled();
    expect(getGpuTelemetrySnapshot().sampleCount).toBe(0);

    // Enabled telemetry -> reads gl.info and publishes into gpuTelemetryBus
    setGpuTelemetryEnabled(true);
    expect(sampleRendererGpuTelemetry(mockGl, 0.016)).toBe(true);
    expect(infoGetter).toHaveBeenCalled();

    const snap = getGpuTelemetrySnapshot();
    expect(snap.sampleCount).toBe(1);
    expect(snap.frameMs).toBeCloseTo(16, 1);
    expect(snap.drawCalls).toBe(74);
    expect(snap.triangles).toBe(312_400);
    expect(snap.geometries).toBe(92);
    expect(snap.textures).toBe(44);
    expect(snap.programs).toBe(16);
  });

  it('orders quality tier postfx budgets strictly ultra > balanced > eco and cleans up GTAOPass materials completely', () => {
    expect(GRAPHICS_QUALITY_TIERS).toEqual(['ultra', 'balanced', 'eco']);
    const ultra = getGraphicsQualityTelemetryMeta('ultra');
    const balanced = getGraphicsQualityTelemetryMeta('balanced');
    const eco = getGraphicsQualityTelemetryMeta('eco');

    expect(ultra.enabledPostfxPasses).toBeGreaterThan(
      balanced.enabledPostfxPasses
    );
    expect(balanced.enabledPostfxPasses).toBeGreaterThan(
      eco.enabledPostfxPasses
    );
    expect(eco.enabledPostfxPasses).toBe(0);

    const gtaoDispose = vi.fn();
    const gtaoMatDispose = vi.fn();
    const blendMatDispose = vi.fn();
    const depthTexDispose = vi.fn();
    const visCache = new Map<THREE.Object3D, boolean>([
      [new THREE.Object3D(), true],
    ]);

    const fakeGtao = {
      dispose: gtaoDispose,
      gtaoMaterial: { dispose: gtaoMatDispose },
      blendMaterial: { dispose: blendMatDispose },
      depthTexture: { dispose: depthTexDispose },
      _visibilityCache: visCache,
    } as unknown as GTAOPass;

    disposeGtaoPassResources(fakeGtao);
    expect(gtaoDispose).toHaveBeenCalledTimes(1);
    expect(gtaoMatDispose).toHaveBeenCalledTimes(1);
    expect(blendMatDispose).toHaveBeenCalledTimes(1);
    expect(depthTexDispose).toHaveBeenCalledTimes(1);
    expect(visCache.size).toBe(0);

    // Verify ArmoryPostProcessing.tsx guards telemetry behind isGpuTelemetryEnabled() and avoids new THREE. in useFrame
    const postfxSrc = fs.readFileSync(
      path.join(
        REPO_ROOT,
        'src',
        'engine',
        'canvas',
        'ArmoryPostProcessing.tsx'
      ),
      'utf8'
    );
    expect(postfxSrc).toContain('if (isGpuTelemetryEnabled())');
    expect(postfxSrc).toContain('disposeGtaoPassResources(gtaoPass)');
    const useFrameIdx = postfxSrc.indexOf('useFrame((r3fState, delta) => {');
    expect(useFrameIdx).toBeGreaterThan(0);
    const useFrameEnd = postfxSrc.indexOf('}, 1);', useFrameIdx);
    const useFrameBody = postfxSrc.slice(useFrameIdx, useFrameEnd);
    expect(useFrameBody).not.toMatch(/\bnew THREE\./);
  });
});
