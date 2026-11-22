import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACOUSTIC_ENVIRONMENT_CONFIGS,
  ACOUSTIC_ENVIRONMENT_PRESETS,
  computeDynamicWetSendGain,
  generateImpulseResponseSamples,
  getOrCreateAcousticImpulseBuffer,
  PRIMARY_SLAPBACK_DELAYS_MS,
} from '../src/engine/audio/acousticImpulse';
import {
  CALIBER_ACOUSTIC_PROFILES,
  computeSteelWaveguideModalSpec,
  GARAND_ENBLOC_PING_PARTIALS_HZ,
  getAcousticEnvironment,
  playBrassCasingBounceSound,
  playPressCheckSpringSound,
  playSelectorDetentSound,
  playTriggerDryBlockSound,
  playTriggerResetSound,
  setAcousticEnvironment,
  STEEL_BAR_EULER_BERNOULLI_PARTIALS,
} from '../src/engine/audio/mechanicalSoundEngine';
import { playbackClock } from '../src/engine/clock/playbackClock';
import {
  beginManualActionRack,
  computeRecoilSpringForceN,
  getSelectorModeMetadata,
  getSupportedSelectorModes,
  getWeaponActionPartIds,
  getWeaponFireControlProfile,
  interactiveActionStore,
  isWeaponActionPart,
  mapManualRackToFireProgress,
  PRESS_CHECK_RACK_RATIO,
  pressInteractiveTrigger,
  releaseInteractiveTrigger,
  releaseManualActionRack,
  setFireSelectorMode,
  stepInteractiveAction,
  togglePressCheck,
  updateManualActionRack,
} from '../src/engine/interaction/InteractiveActionController';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS, type WeaponId } from '../src/weapons/types';

describe('Hands-On 3D Mechanical Manipulation & Waveguide Convolution Acoustics', () => {
  beforeEach(() => {
    useAppStore.getState().returnToArmory();
    useAppStore.getState().setSfxMuted(false);
    interactiveActionStore.reset('ak15');
    setAcousticEnvironment('indoor_range');
  });

  it('maps authentic SAFE / SEMI / AUTO fire-control capabilities & bilingual tooltips across all 29 exhibits', () => {
    const selectFireWeapons: WeaponId[] = [
      'ak15',
      'm4a1',
      'mp5',
      'scar',
      'aug',
      'p90',
      'vector',
      'g11',
      'vss',
      'an94',
    ];
    const openBoltAutoWeapons: WeaponId[] = ['m249', 'm134'];
    const semiOnlyWeapons: WeaponId[] = [
      'g17',
      'p320',
      'deagle',
      'm82a1',
      'awm',
      'lift33',
      'r500',
      'python',
      'benellim4',
      'garand',
      'p08',
      'ztz99a',
      'm1a2',
      'leopard2a7',
      'tiger1',
      'winchester1894',
      'rem870',
    ];

    expect(
      selectFireWeapons.length +
        openBoltAutoWeapons.length +
        semiOnlyWeapons.length
    ).toBe(WEAPON_IDS.length);

    for (const w of selectFireWeapons) {
      expect(getSupportedSelectorModes(w)).toEqual(['safe', 'semi', 'auto']);
    }

    for (const w of openBoltAutoWeapons) {
      expect(getSupportedSelectorModes(w)).toEqual(['safe', 'auto']);
    }

    for (const w of semiOnlyWeapons) {
      expect(getSupportedSelectorModes(w)).toEqual(['safe', 'semi']);
    }

    // Verify bilingualzh/en tooltips & Glock Safe-Action educational note
    for (const weaponId of WEAPON_IDS) {
      const profile = getWeaponFireControlProfile(weaponId);
      expect(profile.mechanismSummaryZh.trim().length).toBeGreaterThan(4);
      expect(profile.mechanismSummaryEn.trim().length).toBeGreaterThan(4);

      for (const mode of getSupportedSelectorModes(weaponId)) {
        const meta = getSelectorModeMetadata(weaponId, mode);
        expect(meta, `Missing ${weaponId}:${mode} metadata`).not.toBeNull();
        expect(meta!.labelZh.trim().length).toBeGreaterThan(0);
        expect(meta!.labelEn.trim().length).toBeGreaterThan(0);
        expect(meta!.tooltipZh.trim().length).toBeGreaterThan(8);
        expect(meta!.tooltipEn.trim().length).toBeGreaterThan(8);
      }
    }

    const g17Safe = getSelectorModeMetadata('g17', 'safe')!;
    expect(g17Safe.tooltipEn).toContain('Trigger Safety Blade');
    expect(g17Safe.tooltipZh).toContain('Safe-Action');
    expect(getSelectorModeMetadata('g17', 'auto')).toBeNull();

    // Requesting AUTO on a semi-only pistol/sniper clamps safely to SEMI
    useAppStore.getState().enterWorkbench('m4a1', 'firing');
    expect(setFireSelectorMode('auto')).toBe('auto');
    expect(interactiveActionStore.getSnapshot().selectorMode).toBe('auto');

    useAppStore.getState().enterWorkbench('g17', 'firing');
    interactiveActionStore.syncWeapon('g17');
    expect(interactiveActionStore.getSnapshot().selectorMode).toBe('semi');
    expect(setFireSelectorMode('auto')).toBe('semi');

    // Open-bolt M249 SAW supports SAFE / AUTO only; requesting SEMI clamps safely to AUTO
    useAppStore.getState().enterWorkbench('m249', 'firing');
    interactiveActionStore.syncWeapon('m249');
    expect(setFireSelectorMode('semi')).toBe('auto');
  });

  it('identifies authentic reciprocating slide/bolt/charging-handle & archery draw parts on all 23 exhibits without matching pins/locks', async () => {
    for (const weaponId of WEAPON_IDS) {
      const plugin = await loadWeaponPlugin(weaponId);
      const partIdSet = new Set(plugin.parts.map((p) => p.id));
      const actionIds = getWeaponActionPartIds(weaponId);
      expect(
        actionIds.length,
        `${weaponId} must expose at least 1 action part`
      ).toBeGreaterThanOrEqual(1);

      for (const id of actionIds) {
        expect(
          partIdSet.has(id),
          `${weaponId} action part "${id}" missing from plugin BOM`
        ).toBe(true);
        expect(isWeaponActionPart(weaponId, id)).toBe(true);
      }
    }

    // Generic operating_rod support & strict exclusion of non-reciprocating locks/pins
    expect(isWeaponActionPart('m4a1', 'garand_operating_rod')).toBe(true);
    expect(isWeaponActionPart('g17', 'slide_lock')).toBe(false);
    expect(isWeaponActionPart('g17', 'slide_stop_lever')).toBe(false);
    expect(isWeaponActionPart('g17', 'slide_cover_plate')).toBe(false);
    expect(isWeaponActionPart('p320', 'p320_slide_catch')).toBe(false);
    expect(isWeaponActionPart('scar', 'scar_barrel_crossbolts')).toBe(false);
  });

  it('enforces SAFE mechanical block, SEMI two-stage wall/break + disconnector reset, and AUTO cyclic fire', () => {
    useAppStore.getState().enterWorkbench('ak15', 'firing');
    useAppStore.getState().stopFiringPlay();

    // 1. SAFE mode: blocks trigger dead, increments safetyBlockedSeq, never fires
    setFireSelectorMode('safe');
    const prevBlocked = interactiveActionStore.getSnapshot().safetyBlockedSeq;
    pressInteractiveTrigger();
    stepInteractiveAction(0.05);
    stepInteractiveAction(0.05);

    expect(interactiveActionStore.getSnapshot().safetyBlockedSeq).toBe(
      prevBlocked + 1
    );
    expect(
      interactiveActionStore.getTransientState().triggerPullProgress
    ).toBeCloseTo(0.18, 3);
    expect(useAppStore.getState().isFiringPlaying).toBe(false);
    releaseInteractiveTrigger();
    stepInteractiveAction(0.05);
    expect(interactiveActionStore.getTransientState().triggerPullProgress).toBe(
      0
    );

    // 2. SEMI mode: Take-Up (0..0.65) -> Sear Wall pause (0.65..0.85) -> Sear Break (1.0), single cycle + disconnector lock
    setFireSelectorMode('semi');
    pressInteractiveTrigger();

    // Take-up phase (~30ms)
    stepInteractiveAction(0.03);
    const takeUpP =
      interactiveActionStore.getTransientState().triggerPullProgress;
    expect(takeUpP).toBeGreaterThan(0.3);
    expect(takeUpP).toBeLessThanOrEqual(0.65);
    expect(useAppStore.getState().isFiringPlaying).toBe(false);

    // Sear wall creep (~35ms more reaches wall [0.65..0.85) without breaking yet)
    stepInteractiveAction(0.02);
    stepInteractiveAction(0.02);
    const wallP =
      interactiveActionStore.getTransientState().triggerPullProgress;
    expect(wallP).toBeGreaterThan(0.65);
    expect(wallP).toBeLessThan(0.85);
    expect(useAppStore.getState().isFiringPlaying).toBe(false);

    // Break past sear wall -> single shot fires!
    stepInteractiveAction(0.05);
    expect(interactiveActionStore.getTransientState().triggerPullProgress).toBe(
      1.0
    );
    expect(
      interactiveActionStore.getSnapshot().awaitingDisconnectorReset
    ).toBe(true);
    expect(useAppStore.getState().isFiringPlaying).toBe(true);
    expect(useAppStore.getState().fireLoop).toBe(false);

    // Simulate firing cycle reaching disconnector hold while user keeps holding trigger
    playbackClock.setFireProgress(0.88, true);
    stepInteractiveAction(0.016);
    expect(useAppStore.getState().isFiringPlaying).toBe(false);
    expect(
      interactiveActionStore.getSnapshot().awaitingDisconnectorReset
    ).toBe(true);

    // Attempting another pull without releasing CANNOT fire while disconnector holds hammer!
    pressInteractiveTrigger();
    stepInteractiveAction(0.08);
    expect(useAppStore.getState().isFiringPlaying).toBe(false);

    // Releasing trigger resets disconnector so next pull fires cleanly!
    releaseInteractiveTrigger();
    expect(
      interactiveActionStore.getSnapshot().awaitingDisconnectorReset
    ).toBe(false);
    for (let i = 0; i < 10; i++) stepInteractiveAction(0.02);
    expect(interactiveActionStore.getTransientState().triggerPullProgress).toBe(
      0
    );

    // Second SEMI shot works after disconnector reset
    pressInteractiveTrigger();
    for (let i = 0; i < 6; i++) stepInteractiveAction(0.03);
    expect(useAppStore.getState().isFiringPlaying).toBe(true);
    expect(useAppStore.getState().fireLoop).toBe(false);
    releaseInteractiveTrigger();
    useAppStore.getState().stopFiringPlay();

    // 3. AUTO mode: breaks into continuous cyclic fire (fireLoop = true) and stops cleanly in battery on release
    setFireSelectorMode('auto');
    pressInteractiveTrigger();
    for (let i = 0; i < 6; i++) stepInteractiveAction(0.03);
    expect(useAppStore.getState().isFiringPlaying).toBe(true);
    expect(useAppStore.getState().fireLoop).toBe(true);

    // Release trigger mid-burst -> disables fireLoop so active round finishes in battery
    playbackClock.setFireProgress(0.45, true);
    releaseInteractiveTrigger();
    expect(useAppStore.getState().fireLoop).toBe(false);
    expect(interactiveActionStore.getSnapshot().isTriggerHeld).toBe(false);
  });

  it('supports 28% Press-Check, recoil-spring resistance, <50% battery snap, and >85% fresh-round chambering', () => {
    useAppStore.getState().enterWorkbench('m4a1', 'firing');
    useAppStore.getState().stopFiringPlay();

    // 1. Tactical Press-Check (28% partial chamber peek -> fireProgress ~ 0.404)
    expect(togglePressCheck()).toBe(true);
    expect(interactiveActionStore.getSnapshot().isPressCheck).toBe(true);
    for (let i = 0; i < 20; i++) stepInteractiveAction(0.02);
    expect(
      interactiveActionStore.getTransientState().manualRackProgress
    ).toBeCloseTo(PRESS_CHECK_RACK_RATIO, 2);
    expect(playbackClock.getState().fireProgress).toBeCloseTo(
      mapManualRackToFireProgress(PRESS_CHECK_RACK_RATIO),
      2
    );

    // Releasing Press-Check snaps forward into battery (0.0)
    expect(togglePressCheck()).toBe(false);
    for (let i = 0; i < 15; i++) stepInteractiveAction(0.02);
    expect(interactiveActionStore.getTransientState().manualRackProgress).toBe(
      0
    );
    expect(playbackClock.getState().fireProgress).toBe(0);

    // 2. Partial drag (< 50%) fights recoil spring and snaps back to 0.0 on release
    beginManualActionRack();
    updateManualActionRack(0.38);
    const partialRack =
      interactiveActionStore.getTransientState().manualRackProgress;
    expect(partialRack).toBeGreaterThan(0.25);
    expect(partialRack).toBeLessThan(0.5);
    expect(playbackClock.getState().fireProgress).toBeGreaterThan(0.39);
    expect(playbackClock.getState().fireProgress).toBeLessThan(0.47);
    expect(
      computeRecoilSpringForceN('m82a1', partialRack)
    ).toBeGreaterThan(computeRecoilSpringForceN('g17', partialRack));

    releaseManualActionRack();
    for (let i = 0; i < 15; i++) stepInteractiveAction(0.02);
    expect(interactiveActionStore.getTransientState().manualRackProgress).toBe(
      0
    );
    expect(playbackClock.getState().fireProgress).toBe(0);

    // 3. Full rack (> 85%) strips & chambers a fresh round along [0.68 -> 1.0] into battery
    beginManualActionRack();
    for (let i = 0; i < 6; i++) updateManualActionRack(0.35);
    expect(
      interactiveActionStore.getTransientState().manualRackProgress
    ).toBeGreaterThan(0.85);
    expect(playbackClock.getState().fireProgress).toBeCloseTo(0.62, 1);

    releaseManualActionRack();
    expect(playbackClock.getState().fireProgress).toBeCloseTo(0.68, 2);
    stepInteractiveAction(0.03);
    expect(playbackClock.getState().fireProgress).toBeGreaterThan(0.74);
    expect(playbackClock.getState().fireProgress).toBeLessThan(1.0);

    for (let i = 0; i < 15; i++) stepInteractiveAction(0.02);
    expect(interactiveActionStore.getTransientState().manualRackProgress).toBe(
      0
    );
    expect(playbackClock.getState().fireProgress).toBe(0);

    // 4. Archery draw-stroke mapping [0..0.30] & compound cam let-off curve (85% on lift33, 38% on r500)
    expect(mapManualRackToFireProgress(0, 'lift33')).toBe(0);
    expect(mapManualRackToFireProgress(1, 'lift33')).toBeCloseTo(0.3, 6);
    expect(mapManualRackToFireProgress(0.5, 'r500')).toBeCloseTo(0.15, 6);
    const bowPeak = computeRecoilSpringForceN('lift33', 0.65);
    const bowValley = computeRecoilSpringForceN('lift33', 1.0);
    expect(bowPeak).toBeCloseTo(311.4, 1);
    expect(bowValley).toBeCloseTo(46.7, 1);
    expect(bowValley).toBeLessThan(bowPeak * 0.2);

    const xbowPeak = computeRecoilSpringForceN('r500', 0.72);
    const xbowValley = computeRecoilSpringForceN('r500', 1.0);
    expect(xbowPeak).toBeCloseTo(1334.5, 1);
    expect(xbowValley).toBeCloseTo(827.4, 1);
  });

  it('generates stereo Room Impulse Responses (bench_close, indoor_range, tactical_hall) & Euler-Bernoulli steel waveguides', () => {
    expect(ACOUSTIC_ENVIRONMENT_PRESETS).toEqual([
      'bench_close',
      'indoor_range',
      'tactical_hall',
    ]);
    expect(PRIMARY_SLAPBACK_DELAYS_MS).toEqual([7, 13, 21, 34]);

    const irBench = generateImpulseResponseSamples('bench_close', 48000);
    const irRange = generateImpulseResponseSamples('indoor_range', 48000);
    const irHall = generateImpulseResponseSamples('tactical_hall', 48000);

    expect(irBench.durationSec).toBeCloseTo(0.18, 3);
    expect(irRange.durationSec).toBeCloseTo(0.65, 3);
    expect(irHall.durationSec).toBeCloseTo(1.35, 3);

    expect(irBench.length).toBe(Math.round(0.18 * 48000));
    expect(irRange.length).toBe(Math.round(0.65 * 48000));
    expect(irHall.length).toBe(Math.round(1.35 * 48000));

    for (const ir of [irBench, irRange, irHall]) {
      expect(ir.peakAbs).toBeGreaterThan(0.85);
      expect(ir.peakAbs).toBeLessThanOrEqual(0.95);
      expect(ir.rmsLeft).toBeGreaterThan(0.01);
      expect(ir.rmsRight).toBeGreaterThan(0.01);

      // Verify finite non-NaN stereo samples & true L/R binaural decorrelation
      let diffEnergy = 0;
      for (let i = 0; i < ir.length; i++) {
        expect(Number.isFinite(ir.left[i])).toBe(true);
        expect(Number.isFinite(ir.right[i])).toBe(true);
        const d = ir.left[i] - ir.right[i];
        diffEnergy += d * d;
      }
      expect(diffEnergy / ir.length).toBeGreaterThan(0.0002);

      // Verify early slapback reflections exist near 7ms, 13ms, 21ms, 34ms
      for (const delayMs of PRIMARY_SLAPBACK_DELAYS_MS) {
        const center = Math.round(delayMs * 0.001 * ir.sampleRate);
        let windowPeak = 0;
        for (let k = Math.max(0, center - 24); k <= center + 24; k++) {
          windowPeak = Math.max(
            windowPeak,
            Math.abs(ir.left[k]),
            Math.abs(ir.right[k])
          );
        }
        expect(
          windowPeak,
          `Missing early slapback at ${delayMs}ms on ${ir.preset}`
        ).toBeGreaterThan(0.04);
      }

      // Verify decay: first quarter RMS > final quarter RMS
      const q = Math.floor(ir.length / 4);
      let earlySq = 0;
      let lateSq = 0;
      for (let i = 0; i < q; i++) {
        earlySq += ir.left[i] * ir.left[i];
        const li = ir.length - 1 - i;
        lateSq += ir.left[li] * ir.left[li];
      }
      expect(earlySq).toBeGreaterThan(lateSq * 8);

      // High-frequency air absorption RT60 < Low-frequency RT60
      const cfg = ACOUSTIC_ENVIRONMENT_CONFIGS[ir.preset];
      expect(cfg.rt60HighSec).toBeLessThan(cfg.rt60LowSec * 0.6);
    }

    // Verify AudioBuffer caching on BaseAudioContext stub
    let createBufferCalls = 0;
    const mockCtx = {
      sampleRate: 48000,
      createBuffer(channels: number, length: number, sampleRate: number) {
        createBufferCalls++;
        const chData = Array.from(
          { length: channels },
          () => new Float32Array(length)
        );
        return {
          numberOfChannels: channels,
          length,
          sampleRate,
          duration: length / sampleRate,
          getChannelData: (idx: number) => chData[idx],
        } as unknown as AudioBuffer;
      },
    } as unknown as BaseAudioContext;

    const buf1 = getOrCreateAcousticImpulseBuffer(mockCtx, 'tactical_hall');
    const buf2 = getOrCreateAcousticImpulseBuffer(mockCtx, 'tactical_hall');
    expect(buf1).toBe(buf2);
    expect(createBufferCalls).toBe(1);

    // Wet send scaling: 0.25x slow-mo attenuates room reverb vs 1.0x live fire
    for (const preset of ACOUSTIC_ENVIRONMENT_PRESETS) {
      expect(computeDynamicWetSendGain(preset, 0.25)).toBeLessThan(
        computeDynamicWetSendGain(preset, 1.0) * 0.4
      );
      setAcousticEnvironment(preset);
      expect(getAcousticEnvironment()).toBe(preset);
    }

    // Euler-Bernoulli cold-forged steel waveguide partials, WWII M1 Garand "PING!" eigenfrequencies & thermoelastic damping
    expect(GARAND_ENBLOC_PING_PARTIALS_HZ).toEqual([1740, 3510, 5260, 6890]);
    expect(CALIBER_ACOUSTIC_PROFILES['357_magnum'].mechanismStyle).toBe(
      'revolver_magnum'
    );
    expect(CALIBER_ACOUSTIC_PROFILES['12_gauge'].mechanismStyle).toBe(
      'argo_shotgun'
    );
    expect(CALIBER_ACOUSTIC_PROFILES['30_06'].mechanismStyle).toBe(
      'garand_enbloc'
    );
    expect(STEEL_BAR_EULER_BERNOULLI_PARTIALS).toEqual([
      1.0, 2.756, 5.404, 8.933,
    ]);
    const steelModes = computeSteelWaveguideModalSpec(1400, 0.055, 0.85);
    expect(steelModes).toHaveLength(4);
    expect(steelModes[1].freqHz).toBeCloseTo(1400 * 2.756, 3);
    expect(steelModes[3].freqHz).toBeCloseTo(1400 * 8.933, 3);
    expect(steelModes[3].decaySec).toBeLessThan(steelModes[2].decaySec);
    expect(steelModes[2].decaySec).toBeLessThan(steelModes[1].decaySec);
    expect(steelModes[1].decaySec).toBeLessThan(steelModes[0].decaySec);

    // Headless-safe execution of all new exported gunsmith & ballistic sound triggers
    expect(() => {
      playBrassCasingBounceSound('50_bmg', 180);
      playBrassCasingBounceSound('9mm_para', 95);
      playBrassCasingBounceSound('12_gauge', 90);
      playBrassCasingBounceSound('30_06', 140);
      playSelectorDetentSound('safe');
      playSelectorDetentSound('semi');
      playSelectorDetentSound('auto');
      playTriggerDryBlockSound();
      playTriggerResetSound();
      playPressCheckSpringSound('pull');
      playPressCheckSpringSound('release');
    }).not.toThrow();
  });
});
