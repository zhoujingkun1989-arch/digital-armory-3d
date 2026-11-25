import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ACOUSTIC_TELEMETRY_ROOMS,
  APFSDS_SABOT_PETAL_PARTIALS_HZ,
  ROTARY_DRIVE_MOTOR_PROFILES,
  TANK_STUB_CLANG_PARTIALS_HZ,
  getActiveAcousticTelemetry,
  hasMasterSoftCeilingLimiter,
  playHeavyOrdnanceSignatureAudition,
  playWeaponFiringEventSound,
  resetMechanicalSoundEngine,
  stopRotaryDriveMotorSound,
} from '../src/engine/audio/mechanicalSoundEngine';
import {
  AcousticDeckPopover,
  getLiveShotAuditionMeta,
} from '../src/features/workbench/AcousticDeckPopover';
import { useAppStore } from '../src/store/useAppStore';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';
import type { WeaponId } from '../src/weapons/types';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const WP_LEAK_RE = /\bWP-\d{2}[a-z]?\b/i;

interface RecordedOscillatorEvent {
  freqHz: number;
  startTime: number;
  stopped: boolean;
}

interface AudioRecordingLog {
  oscEvents: RecordedOscillatorEvent[];
  filterFreqs: number[];
  gainValues: number[];
  bufferSourcesStarted: number;
  convolversCreated: number;
  compressorsCreated: number;
}

function createRecordingAudioContextClass(log: AudioRecordingLog) {
  const makeAudioParam = (bucket?: number[]) => ({
    value: 0,
    setValueAtTime: (v: number) => {
      bucket?.push(v);
    },
    linearRampToValueAtTime: (v: number) => {
      bucket?.push(v);
    },
    exponentialRampToValueAtTime: (v: number) => {
      bucket?.push(v);
    },
    setTargetAtTime: (v: number) => {
      bucket?.push(v);
    },
  });

  const makeNode = () => ({
    connect: () => {},
    disconnect: () => {},
  });

  return class MockRecordingAudioContext {
    public state: AudioContextState = 'running';
    public sampleRate = 48000;
    public currentTime = 1.0;
    public destination = makeNode();

    public resume(): Promise<void> {
      return Promise.resolve();
    }

    public createDynamicsCompressor() {
      log.compressorsCreated += 1;
      return {
        ...makeNode(),
        threshold: makeAudioParam(),
        knee: makeAudioParam(),
        ratio: makeAudioParam(),
        attack: makeAudioParam(),
        release: makeAudioParam(),
      };
    }

    public createGain() {
      return {
        ...makeNode(),
        gain: makeAudioParam(log.gainValues),
      };
    }

    public createConvolver() {
      log.convolversCreated += 1;
      return {
        ...makeNode(),
        normalize: false,
        buffer: null as AudioBuffer | null,
      };
    }

    public createBuffer(
      channels: number,
      length: number,
      sampleRate: number
    ): AudioBuffer {
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
    }

    public createBufferSource() {
      return {
        ...makeNode(),
        buffer: null as AudioBuffer | null,
        start: () => {
          log.bufferSourcesStarted += 1;
        },
        stop: () => {},
      };
    }

    public createBiquadFilter() {
      return {
        ...makeNode(),
        type: 'bandpass' as BiquadFilterType,
        Q: makeAudioParam(),
        frequency: makeAudioParam(log.filterFreqs),
      };
    }

    public createWaveShaper() {
      return {
        ...makeNode(),
        curve: null as Float32Array | null,
      };
    }

    public createOscillator() {
      const rec: RecordedOscillatorEvent = {
        freqHz: 0,
        startTime: 0,
        stopped: false,
      };
      const freqParam = {
        value: 0,
        setValueAtTime: (v: number) => {
          if (rec.freqHz === 0) rec.freqHz = v;
        },
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        setTargetAtTime: () => {},
      };
      return {
        ...makeNode(),
        type: 'sine' as OscillatorType,
        frequency: freqParam,
        start: (when = 0) => {
          rec.startTime = when;
          log.oscEvents.push(rec);
        },
        stop: () => {
          rec.stopped = true;
        },
      };
    }
  };
}

describe('Cycle 20E — Heavy Ordnance Acoustic Layer & Acoustic Studio Deck Telemetry', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    resetMechanicalSoundEngine();
    useAppStore.getState().setLang('zh');
    useAppStore.getState().setSfxMuted(false);
    useAppStore.getState().setEnvironmentPreset('tactical_vault');
    useAppStore.getState().resetAcousticEnvironmentAuto();
  });

  afterEach(() => {
    stopRotaryDriveMotorSound(true);
    resetMechanicalSoundEngine();
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    }
    useAppStore.getState().setLang('zh');
    useAppStore.getState().setSfxMuted(false);
    useAppStore.getState().resetAll();
  });

  it('provides valid bilingual getActiveAcousticTelemetry across all 100 exhibits × 4 rooms with 0 EN CJK & 0 WP-XX', () => {
    expect(WEAPON_MANIFESTS.length).toBe(100);
    expect(ACOUSTIC_TELEMETRY_ROOMS).toEqual([
      'bench_close',
      'indoor_range',
      'tactical_hall',
      'open_field',
    ]);

    for (const manifest of WEAPON_MANIFESTS) {
      const rt60ByRoom = new Map<string, number>();

      for (const roomId of ACOUSTIC_TELEMETRY_ROOMS) {
        const t = getActiveAcousticTelemetry(manifest.id, roomId);
        expect(t.signatureId.length, `signatureId for ${manifest.id}`).toBeGreaterThan(0);
        expect(t.signatureLabelZh.length).toBeGreaterThan(0);
        expect(t.signatureLabelEn.length).toBeGreaterThan(0);
        expect(t.caliberClassZh.length).toBeGreaterThan(0);
        expect(t.caliberClassEn.length).toBeGreaterThan(0);
        expect(Number.isFinite(t.reverbRt60Sec)).toBe(true);
        expect(t.reverbRt60Sec).toBeGreaterThan(0);
        expect(t.highlightsZh.length).toBeGreaterThanOrEqual(2);
        expect(t.highlightsEn.length).toBeGreaterThanOrEqual(2);

        rt60ByRoom.set(roomId, t.reverbRt60Sec);

        // Zero EN CJK leaks across every EN telemetry string
        expect(
          CJK_RE.test(t.signatureLabelEn),
          `EN CJK in signatureLabelEn for ${manifest.id}`
        ).toBe(false);
        expect(
          CJK_RE.test(t.caliberClassEn),
          `EN CJK in caliberClassEn for ${manifest.id}`
        ).toBe(false);
        for (const chip of t.highlightsEn) {
          expect(chip.length).toBeGreaterThan(0);
          expect(
            CJK_RE.test(chip),
            `EN CJK in highlight "${chip}" for ${manifest.id}`
          ).toBe(false);
          expect(WP_LEAK_RE.test(chip)).toBe(false);
        }

        // Zero WP-XX internal tags in EN or ZH
        expect(WP_LEAK_RE.test(t.signatureLabelEn)).toBe(false);
        expect(WP_LEAK_RE.test(t.signatureLabelZh)).toBe(false);
        expect(WP_LEAK_RE.test(t.caliberClassEn)).toBe(false);
        expect(WP_LEAK_RE.test(t.caliberClassZh)).toBe(false);
        for (const chip of t.highlightsZh) {
          expect(chip.length).toBeGreaterThan(0);
          expect(WP_LEAK_RE.test(chip)).toBe(false);
        }
      }

      // Monotonic room RT60 decay ordering: open_field < bench_close < indoor_range < tactical_hall
      expect(rt60ByRoom.get('open_field')!).toBeLessThan(
        rt60ByRoom.get('bench_close')!
      );
      expect(rt60ByRoom.get('bench_close')!).toBeLessThan(
        rt60ByRoom.get('indoor_range')!
      );
      expect(rt60ByRoom.get('indoor_range')!).toBeLessThan(
        rt60ByRoom.get('tactical_hall')!
      );
    }

    // Heavy ordnance & rotary signature IDs are distinct and explicit
    expect(getActiveAcousticTelemetry('ztz99a').signatureId).toBe(
      'ztz99a_apfsds_autoloader'
    );
    expect(getActiveAcousticTelemetry('m1a2').signatureId).toBe(
      'm1a2_apfsds_bustle'
    );
    expect(getActiveAcousticTelemetry('leopard2a7').signatureId).toBe(
      'leopard2a7_l55_apfsds'
    );
    expect(getActiveAcousticTelemetry('tiger1').signatureId).toBe(
      'tiger1_kwk36_brass'
    );
    expect(getActiveAcousticTelemetry('gau8').signatureId).toBe(
      'gau8_hydraulic_brrrt'
    );
    expect(getActiveAcousticTelemetry('m134').signatureId).toBe(
      'm134_electric_gatling'
    );
  });

  it('synthesizes APFSDS discarding-sabot crack, MBT stub-case clang & Tiger I 88mm brass foley without errors', () => {
    const log: AudioRecordingLog = {
      oscEvents: [],
      filterFreqs: [],
      gainValues: [],
      bufferSourcesStarted: 0,
      convolversCreated: 0,
      compressorsCreated: 0,
    };
    const MockCtx = createRecordingAudioContextClass(log);
    Object.defineProperty(globalThis, 'window', {
      value: { AudioContext: MockCtx },
      configurable: true,
      writable: true,
    });

    // 1. APFSDS smoothbore MBTs emit discarding-sabot petal partials at 1.0x and delayed further at 0.25x slow-mo
    for (const mbtId of ['ztz99a', 'm1a2', 'leopard2a7'] as const) {
      log.oscEvents.length = 0;
      playWeaponFiringEventSound('primer_ignition', mbtId, 1.0);
      const realtimeSabotStarts = APFSDS_SABOT_PETAL_PARTIALS_HZ.map((hz) => {
        const match = log.oscEvents.find((e) => Math.abs(e.freqHz - hz) < 2);
        expect(
          match,
          `${mbtId} 1.0x missing APFSDS sabot partial ${hz} Hz`
        ).toBeDefined();
        return match!.startTime;
      });

      log.oscEvents.length = 0;
      playWeaponFiringEventSound('primer_ignition', mbtId, 0.25);
      const slowMoSabotStarts = APFSDS_SABOT_PETAL_PARTIALS_HZ.map((hz) => {
        const match = log.oscEvents.find((e) => Math.abs(e.freqHz - hz) < 2);
        expect(
          match,
          `${mbtId} 0.25x missing APFSDS sabot partial ${hz} Hz`
        ).toBeDefined();
        return match!.startTime;
      });

      // Slow-motion stretches the sabot separation delay relative to muzzle blast
      expect(slowMoSabotStarts[0]).toBeGreaterThan(realtimeSabotStarts[0] + 0.02);
    }

    // 2. Tiger I (88mm APHE) does NOT emit APFSDS sabot partials, emits twin-baffle 1520 Hz slap instead
    log.oscEvents.length = 0;
    log.filterFreqs.length = 0;
    playWeaponFiringEventSound('primer_ignition', 'tiger1', 1.0);
    expect(
      log.oscEvents.some(
        (e) => Math.abs(e.freqHz - APFSDS_SABOT_PETAL_PARTIALS_HZ[0]) < 2
      )
    ).toBe(false);
    expect(log.filterFreqs).toContain(1520);

    // 3. MBT stub-case clang & Tiger I canvas catch-basket thump on extract_eject
    // (Steel waveguide resonator applies exact 1.012x Hertzian contact micro-chirp on setValueAtTime)
    log.oscEvents.length = 0;
    playWeaponFiringEventSound('extract_eject', 'ztz99a', 1.0);
    expect(
      log.oscEvents.some(
        (e) => Math.abs(e.freqHz - TANK_STUB_CLANG_PARTIALS_HZ[0] * 1.012) < 1.5
      )
    ).toBe(true);
    expect(
      log.oscEvents.some(
        (e) => Math.abs(e.freqHz - TANK_STUB_CLANG_PARTIALS_HZ[1]) < 1.5
      )
    ).toBe(true);

    log.oscEvents.length = 0;
    playWeaponFiringEventSound('extract_eject', 'm1a2', 1.0);
    expect(
      log.oscEvents.some(
        (e) => Math.abs(e.freqHz - TANK_STUB_CLANG_PARTIALS_HZ[1] * 1.012) < 1.5
      )
    ).toBe(true);
    expect(
      log.oscEvents.some(
        (e) => Math.abs(e.freqHz - TANK_STUB_CLANG_PARTIALS_HZ[2] * 1.012) < 1.5
      )
    ).toBe(true);

    log.filterFreqs.length = 0;
    playWeaponFiringEventSound('extract_eject', 'tiger1', 1.0);
    expect(log.filterFreqs).toContain(420);

    // Soft-ceiling limiter & stereo convolver stay active and every gain stays finite & bounded
    expect(hasMasterSoftCeilingLimiter()).toBe(true);
    expect(log.convolversCreated).toBeGreaterThanOrEqual(1);
    for (const g of log.gainValues) {
      expect(Number.isFinite(g)).toBe(true);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(4.0);
    }
  });

  it('starts and cleanly tears down rotary hydraulic (gau8) & electric (m134) drive motor whine without leaking nodes', () => {
    const log: AudioRecordingLog = {
      oscEvents: [],
      filterFreqs: [],
      gainValues: [],
      bufferSourcesStarted: 0,
      convolversCreated: 0,
      compressorsCreated: 0,
    };
    const MockCtx = createRecordingAudioContextClass(log);
    Object.defineProperty(globalThis, 'window', {
      value: { AudioContext: MockCtx },
      configurable: true,
      writable: true,
    });

    // GAU-8/A hydraulic drive spin-up + burst audition
    playHeavyOrdnanceSignatureAudition('gau8', 1.0);
    const gau8MotorProfile = ROTARY_DRIVE_MOTOR_PROFILES.gau8;
    expect(
      log.oscEvents.some(
        (e) => Math.abs(e.freqHz - gau8MotorProfile.baseHz) < 2
      )
    ).toBe(true);
    stopRotaryDriveMotorSound(true);
    expect(log.oscEvents.every((e) => e.stopped)).toBe(true);

    // M134D 28V DC electric drive spin-up + burst audition
    log.oscEvents.length = 0;
    playHeavyOrdnanceSignatureAudition('m134', 0.5);
    const m134MotorProfile = ROTARY_DRIVE_MOTOR_PROFILES.m134;
    expect(
      log.oscEvents.some(
        (e) => Math.abs(e.freqHz - m134MotorProfile.baseHz * 0.82) < 2
      )
    ).toBe(true);
    stopRotaryDriveMotorSound(true);
    expect(log.oscEvents.every((e) => e.stopped)).toBe(true);

    // Audition smoke across representative categories (MBTs, rotary, small arms, archery)
    const smokeIds: readonly WeaponId[] = [
      'ztz99a',
      'm1a2',
      'leopard2a7',
      'tiger1',
      'gau8',
      'm134',
      'm1911',
      'k98k',
      'lift33',
      'ak15',
    ];
    for (const id of smokeIds) {
      expect(() => playHeavyOrdnanceSignatureAudition(id, 1.0)).not.toThrow();
    }
    stopRotaryDriveMotorSound(true);
  });

  it('renders AcousticDeckPopover with live telemetry readout, 4th live-shot audition, aria-live cue & WCAG CSS rules', () => {
    // All 34 exhibits have clean bilingual live-shot audition copy with 0 EN CJK & 0 WP-XX
    for (const manifest of WEAPON_MANIFESTS) {
      const enMeta = getLiveShotAuditionMeta(manifest.id, 'en');
      const zhMeta = getLiveShotAuditionMeta(manifest.id, 'zh');
      expect(enMeta.label.length).toBeGreaterThan(0);
      expect(enMeta.cueTag.length).toBeGreaterThan(0);
      expect(enMeta.title.length).toBeGreaterThan(0);
      expect(zhMeta.label.length).toBeGreaterThan(0);
      expect(zhMeta.cueTag.length).toBeGreaterThan(0);
      expect(CJK_RE.test(enMeta.label)).toBe(false);
      expect(CJK_RE.test(enMeta.cueTag)).toBe(false);
      expect(CJK_RE.test(enMeta.title)).toBe(false);
      expect(WP_LEAK_RE.test(enMeta.title)).toBe(false);
      expect(WP_LEAK_RE.test(zhMeta.title)).toBe(false);
    }

    const featuredExhibits: readonly WeaponId[] = [
      'ztz99a',
      'm1a2',
      'leopard2a7',
      'tiger1',
      'gau8',
      'm134',
      'm1911',
      'lift33',
    ];

    for (const weaponId of featuredExhibits) {
      const telemetry = getActiveAcousticTelemetry(weaponId, 'tactical_hall');
      const htmlEn = renderToStaticMarkup(
        React.createElement(AcousticDeckPopover, {
          defaultOpen: true,
          weaponIdOverride: weaponId,
          langOverride: 'en',
        })
      );
      const htmlZh = renderToStaticMarkup(
        React.createElement(AcousticDeckPopover, {
          defaultOpen: true,
          weaponIdOverride: weaponId,
          langOverride: 'zh',
        })
      );

      expect(htmlEn).toContain('data-testid="acoustic-deck-telemetry"');
      expect(htmlEn).toContain(`data-signature-id="${telemetry.signatureId}"`);
      expect(htmlEn).toContain(
        `data-rt60-sec="${telemetry.reverbRt60Sec.toFixed(2)}"`
      );
      expect(htmlEn).toContain(
        telemetry.caliberClassEn.replace(/&/g, '&amp;')
      );
      expect(htmlZh).toContain(
        telemetry.caliberClassZh.replace(/&/g, '&amp;')
      );

      // All 4 audition controls + persistent polite live status region
      expect(htmlEn).toContain('data-testid="acoustic-audition-shot"');
      expect(htmlEn).toContain('data-testid="acoustic-audition-action"');
      expect(htmlEn).toContain('data-testid="acoustic-audition-brass"');
      expect(htmlEn).toContain('data-testid="acoustic-audition-chamber"');
      expect(htmlEn).toContain('data-testid="acoustic-live-cue"');
      expect(htmlEn).toContain('aria-live="polite"');
      expect(htmlEn).toContain('role="status"');

      expect(CJK_RE.test(htmlEn), `CJK leak in EN deck for ${weaponId}`).toBe(
        false
      );
      expect(WP_LEAK_RE.test(htmlEn)).toBe(false);
      expect(WP_LEAK_RE.test(htmlZh)).toBe(false);
    }

    // Verify Blueprint Daylight, mobile >= 34px touch target, 0px X-overflow & reduced-motion CSS
    const wbCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/workbench.css'),
      'utf8'
    );
    expect(wbCss).toContain('.acoustic-deck-telemetry');
    expect(wbCss).toContain('.acoustic-deck-shot-btn');
    expect(wbCss).toContain('.acoustic-deck-foley-4grid');
    expect(wbCss).toContain(
      ":is([data-theme='light'], .theme-light) .acoustic-deck-telemetry"
    );
    expect(wbCss).toContain(
      ":is([data-theme='light'], .theme-light) .acoustic-deck-shot-btn"
    );
    expect(wbCss).toMatch(
      /@media\s*\(max-width:\s*768px\)[\s\S]*?\.acoustic-deck-popover\s+button\s*\{[\s\S]*?min-height:\s*34px;/
    );
    expect(wbCss).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.acoustic-deck-shot-btn/
    );
    const openBraces = (wbCss.match(/\{/g) ?? []).length;
    const closeBraces = (wbCss.match(/\}/g) ?? []).length;
    expect(openBraces).toBe(closeBraces);
  });
});
