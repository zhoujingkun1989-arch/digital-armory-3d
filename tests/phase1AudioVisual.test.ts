import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CALIBER_ACOUSTIC_PROFILES,
  computeNarrationDuckingGain,
  computeWeaponFiringSoundCues,
  detectCrossedFiringCues,
  type FiringSoundEventKind,
} from '../src/engine/audio/mechanicalSoundEngine';
import { playbackClock } from '../src/engine/clock/playbackClock';
import { SHOWCASE_STRINGS } from '../src/i18n/showcaseStrings';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import {
  findActiveSubtitleCueIndex,
  resolveDirectorBeat,
  splitScriptIntoTimedCues,
} from '../src/narration/storyDirector';
import type { WeaponNarrationBundle } from '../src/narration/types';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS } from '../src/weapons/types';

function assertBilingualShapeParity(
  zhVal: unknown,
  enVal: unknown,
  keyPath = 'root'
): void {
  expect(typeof enVal, `Type mismatch at ${keyPath}`).toBe(typeof zhVal);

  if (typeof zhVal === 'string') {
    expect(zhVal.trim().length, `Empty zh string at ${keyPath}`).toBeGreaterThan(
      0
    );
    expect(
      (enVal as string).trim().length,
      `Empty en string at ${keyPath}`
    ).toBeGreaterThan(0);
    return;
  }

  if (typeof zhVal === 'function') {
    const zhOut = (zhVal as (...args: unknown[]) => string)('AK-15', 26);
    const enOut = (enVal as (...args: unknown[]) => string)('AK-15', 26);
    expect(typeof zhOut).toBe('string');
    expect(typeof enOut).toBe('string');
    expect(zhOut.trim().length).toBeGreaterThan(0);
    expect(enOut.trim().length).toBeGreaterThan(0);
    return;
  }

  if (Array.isArray(zhVal)) {
    const enArr = enVal as unknown[];
    expect(enArr.length, `Array length mismatch at ${keyPath}`).toBe(
      zhVal.length
    );
    for (let i = 0; i < zhVal.length; i++) {
      assertBilingualShapeParity(zhVal[i], enArr[i], `${keyPath}[${i}]`);
    }
    return;
  }

  if (zhVal && typeof zhVal === 'object') {
    const zhKeys = Object.keys(zhVal as Record<string, unknown>).sort();
    const enKeys = Object.keys(enVal as Record<string, unknown>).sort();
    expect(enKeys, `Key mismatch at ${keyPath}`).toEqual(zhKeys);
    for (const k of zhKeys) {
      assertBilingualShapeParity(
        (zhVal as Record<string, unknown>)[k],
        (enVal as Record<string, unknown>)[k],
        `${keyPath}.${k}`
      );
    }
  }
}

describe('Phase 1 (WP-01 ~ WP-03): Multimodal Audio-Visual Immersion Contracts', () => {
  it('WP-01: enforces 100% zh/en bilingual parity across UI_STRINGS and SHOWCASE_STRINGS', () => {
    assertBilingualShapeParity(UI_STRINGS.zh, UI_STRINGS.en, 'UI_STRINGS');
    assertBilingualShapeParity(
      SHOWCASE_STRINGS.zh,
      SHOWCASE_STRINGS.en,
      'SHOWCASE_STRINGS'
    );

    expect(SHOWCASE_STRINGS.zh.documentary.acts).toHaveLength(4);
    expect(SHOWCASE_STRINGS.en.documentary.acts).toHaveLength(4);
    expect(SHOWCASE_STRINGS.zh.gallery.items).toHaveLength(6);
    expect(SHOWCASE_STRINGS.en.quickstart.shortcuts.some((s) => s.key === 'M')).toBe(
      true
    );
  });

  it('WP-02: splits all 80 bilingual act audioScripts into valid monotonic cues without breaking decimals', () => {
    for (const weaponId of WEAPON_IDS) {
      const jsonPath = path.resolve(
        process.cwd(),
        `public/narrations/${weaponId}.json`
      );
      const bundle = JSON.parse(
        fs.readFileSync(jsonPath, 'utf-8')
      ) as WeaponNarrationBundle;

      for (const lang of ['zh', 'en'] as const) {
        const story = bundle.story[lang];
        expect(story.acts).toHaveLength(4);

        for (const act of story.acts) {
          const cues = splitScriptIntoTimedCues(act.audioScript, lang);
          expect(
            cues.length,
            `${weaponId}:${lang}:${act.id} should split into multiple cues`
          ).toBeGreaterThanOrEqual(2);
          expect(cues[0].startRatio).toBe(0);
          expect(cues[cues.length - 1].endRatio).toBe(1);

          for (let i = 0; i < cues.length; i++) {
            expect(cues[i].text.length).toBeGreaterThan(3);
            expect(cues[i].endRatio).toBeGreaterThan(cues[i].startRatio);
            if (i > 0) {
              expect(cues[i].startRatio).toBeCloseTo(cues[i - 1].endRatio, 8);
            }
            // Must never split a decimal like "7.62" into "...7." + "62..."
            if (i + 1 < cues.length && /\d\.$/.test(cues[i].text)) {
              expect(cues[i + 1].text).not.toMatch(/^\d/);
            }
          }

          expect(findActiveSubtitleCueIndex(cues, 0)).toBe(0);
          expect(findActiveSubtitleCueIndex(cues, 0.999)).toBe(cues.length - 1);
        }
      }
    }

    const decimalTest = splitScriptIntoTimedCues(
      'Chambered in 7.62x39mm, 5.56 NATO, and .50 BMG at 0.25x speed. M. Kalashnikov finalized the AK-15.',
      'en'
    );
    expect(decimalTest).toHaveLength(2);
    expect(decimalTest[0].text).toContain('7.62x39mm');
    expect(decimalTest[0].text).toContain('5.56 NATO');
    expect(decimalTest[0].text).toContain('.50 BMG');
    expect(decimalTest[1].text).toContain('M. Kalashnikov');
  });

  it('WP-02: choreographs all 4 acts across PBR focus, Section-Cut (C), X-Ray, and 0.25x slow-mo firing', () => {
    const akPath = path.resolve(process.cwd(), 'public/narrations/ak15.json');
    const akBundle = JSON.parse(
      fs.readFileSync(akPath, 'utf-8')
    ) as WeaponNarrationBundle;
    const story = akBundle.story.zh;

    // Act 1 Beat A -> 1:1 PBR Focus, Beat B -> 30% Field Strip
    const b1a = resolveDirectorBeat('ak15', story, 'act1', 0.12)!;
    expect(b1a.stage.mode).toBe('explode');
    expect(b1a.stage.targetProgress).toBe(0);
    expect(b1a.stage.focusPartId).toBe('ak_barrel');

    const b1b = resolveDirectorBeat('ak15', story, 'act1', 0.72)!;
    expect(b1b.stage.targetProgress).toBeCloseTo(0.3);

    // Act 2 -> GPU Longitudinal Section-Cut (C)
    const b2a = resolveDirectorBeat('ak15', story, 'act2', 0.2)!;
    expect(b2a.stage.sectionCut).toBe(true);
    expect(b2a.stage.xrayShells).toBe(false);
    useAppStore.getState().applyStoryDirectorStage(b2a.stage);
    expect(useAppStore.getState().screen).toBe('workbench');
    expect(useAppStore.getState().sectionCut).toBe(true);
    expect(useAppStore.getState().xrayShells).toBe(false);

    // Act 3 -> X-Ray Lockup & 52% Sub-Strip
    const b3b = resolveDirectorBeat('ak15', story, 'act3', 0.68)!;
    expect(b3b.stage.xrayShells).toBe(true);
    expect(b3b.stage.sectionCut).toBe(false);
    expect(b3b.stage.targetProgress).toBeCloseTo(0.52);
    useAppStore.getState().applyStoryDirectorStage(b3b.stage);
    expect(useAppStore.getState().xrayShells).toBe(true);
    expect(playbackClock.getState().targetProgress).toBeCloseTo(0.52);

    // Act 4 -> 0.25x Ultra-Slow Live Firing (X-Ray -> Cutaway)
    const b4a = resolveDirectorBeat('ak15', story, 'act4', 0.2)!;
    expect(b4a.stage.mode).toBe('firing');
    expect(b4a.stage.fireSpeedMultiplier).toBe(0.25);
    expect(b4a.stage.xrayShells).toBe(true);

    const b4b = resolveDirectorBeat('ak15', story, 'act4', 0.8)!;
    expect(b4b.stage.mode).toBe('firing');
    expect(b4b.stage.fireSpeedMultiplier).toBe(0.25);
    expect(b4b.stage.sectionCut).toBe(true);
    useAppStore.getState().applyStoryDirectorStage(b4b.stage);
    expect(useAppStore.getState().mode).toBe('firing');
    expect(useAppStore.getState().fireSpeedMultiplier).toBe(0.25);
    expect(useAppStore.getState().isFiringPlaying).toBe(true);
    expect(useAppStore.getState().sectionCut).toBe(true);

    // Reset store cleanly
    useAppStore.getState().returnToArmory();
  });

  it('WP-03: enforces physical 6-caliber acoustic hierarchy, 8-event slow-mo phase separation, and TTS ducking', async () => {
    const p50 = CALIBER_ACOUSTIC_PROFILES['50_bmg'];
    const p338 = CALIBER_ACOUSTIC_PROFILES['338_lapua'];
    const p50ae = CALIBER_ACOUSTIC_PROFILES['50_ae'];
    const p762 = CALIBER_ACOUSTIC_PROFILES['762_m43'];
    const p556 = CALIBER_ACOUSTIC_PROFILES['556_nato'];
    const p9 = CALIBER_ACOUSTIC_PROFILES['9mm_para'];

    // Fundamental sub-bass frequency scales inversely with cartridge impulse energy
    expect(p50.subFreqHz).toBeLessThan(p338.subFreqHz);
    expect(p338.subFreqHz).toBeLessThan(p50ae.subFreqHz);
    expect(p50ae.subFreqHz).toBeLessThan(p762.subFreqHz);
    expect(p762.subFreqHz).toBeLessThan(p556.subFreqHz);
    expect(p556.subFreqHz).toBeLessThan(p9.subFreqHz);

    // Blast tail & peak gain scale positively with propellant charge
    expect(p50.blastTailSec).toBeGreaterThan(p9.blastTailSec * 3);
    expect(p50.peakGain).toBeGreaterThan(p9.peakGain);

    // Audio Ducking attenuation when TTS narration is active
    expect(computeNarrationDuckingGain(true)).toBeLessThan(0.3);
    expect(computeNarrationDuckingGain(false)).toBe(1.0);

    // Independent SFX mute state toggle
    expect(useAppStore.getState().sfxMuted).toBe(false);
    useAppStore.getState().toggleSfxMuted();
    expect(useAppStore.getState().sfxMuted).toBe(true);
    useAppStore.getState().toggleSfxMuted();
    expect(useAppStore.getState().sfxMuted).toBe(false);

    const expectedKinds: FiringSoundEventKind[] = [
      'sear_release',
      'primer_ignition',
      'gas_or_recoil',
      'cam_unlock',
      'extract_eject',
      'spring_feed',
      'battery_lockup',
      'sear_reset',
    ];

    // Verify all 10 weapon plugins emit all 8 mechanical & ballistic events in exact order during a 0.25x cycle
    for (const weaponId of WEAPON_IDS) {
      const plugin = await loadWeaponPlugin(weaponId);
      const cues = computeWeaponFiringSoundCues(plugin.firingPhases);
      expect(cues).toHaveLength(8);

      const triggered: FiringSoundEventKind[] = [];
      let prev = 0;
      const totalSteps = 200;
      for (let step = 1; step <= totalSteps; step++) {
        const next = step / totalSteps;
        const crossed = detectCrossedFiringCues(cues, prev, next);
        for (const c of crossed) {
          triggered.push(c.kind);
        }
        prev = next;
      }

      expect(triggered, `8-event sequence mismatch on ${weaponId}`).toEqual(
        expectedKinds
      );

      // Verify continuous loop wraparound (0.98 -> 0.05) triggers sear_release cleanly
      const wrapCrossed = detectCrossedFiringCues(cues, 0.98, 0.05);
      expect(wrapCrossed.map((c) => c.kind)).toContain('sear_release');
    }
  });
});
