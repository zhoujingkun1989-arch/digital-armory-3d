import { useEffect } from 'react';
import {
  getNarrationAudioSnapshot,
  subscribeAudioPlayer,
} from '../../narration/audioPlayer';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { getLoadedWeaponPlugin } from '../../weapons/registry';
import type {
  CaliberProfile,
  FiringPhaseInfo,
  WeaponId,
} from '../../weapons/types';
import { playbackClock } from '../clock/playbackClock';

export type MechanismAcousticStyle =
  | 'long_stroke_piston'
  | 'gas_carbine'
  | 'compact_9mm'
  | 'short_recoil_heavy'
  | 'bolt_action'
  | 'gas_magnum_pistol';

export interface CaliberAcousticProfile {
  caliber: CaliberProfile;
  labelEn: string;
  labelZh: string;
  /** Fundamental chamber shockwave frequency in Hz (lower = heavier chest punch) */
  subFreqHz: number;
  /** Sub-bass pressure envelope decay in seconds */
  punchDecaySec: number;
  /** Muzzle blast / brake tail decay in seconds */
  blastTailSec: number;
  /** Supersonic crack center frequency in Hz */
  crackCutoffHz: number;
  /** Normalized peak muzzle impulse gain [0..1] */
  peakGain: number;
  /** Muzzle brake lateral gas roar gain [0..1] */
  brakeRoarGain: number;
  /** Spent casing metallic ring base frequency in Hz (larger brass = lower pitch) */
  casingRingHz: number;
  mechanismStyle: MechanismAcousticStyle;
}

export const CALIBER_ACOUSTIC_PROFILES: Record<
  CaliberProfile,
  CaliberAcousticProfile
> = {
  '50_bmg': {
    caliber: '50_bmg',
    labelEn: '12.7×99mm NATO (.50 BMG)',
    labelZh: '12.7×99mm (.50 BMG 反器材重弹)',
    subFreqHz: 38,
    punchDecaySec: 0.48,
    blastTailSec: 0.84,
    crackCutoffHz: 1580,
    peakGain: 1.0,
    brakeRoarGain: 0.68,
    casingRingHz: 1780,
    mechanismStyle: 'short_recoil_heavy',
  },
  '338_lapua': {
    caliber: '338_lapua',
    labelEn: '.338 Lapua Magnum (8.6×70mm)',
    labelZh: '.338 普阿马格南远射狙击弹',
    subFreqHz: 50,
    punchDecaySec: 0.36,
    blastTailSec: 0.64,
    crackCutoffHz: 2280,
    peakGain: 0.91,
    brakeRoarGain: 0.48,
    casingRingHz: 2140,
    mechanismStyle: 'bolt_action',
  },
  '50_ae': {
    caliber: '50_ae',
    labelEn: '.50 Action Express (12.7×33mmRB)',
    labelZh: '.50 AE 大威力马格南手枪弹',
    subFreqHz: 58,
    punchDecaySec: 0.3,
    blastTailSec: 0.5,
    crackCutoffHz: 2560,
    peakGain: 0.86,
    brakeRoarGain: 0.36,
    casingRingHz: 2480,
    mechanismStyle: 'gas_magnum_pistol',
  },
  '762_m43': {
    caliber: '762_m43',
    labelEn: '7.62×39mm M43',
    labelZh: '7.62×39mm M43 中间威力步枪弹',
    subFreqHz: 68,
    punchDecaySec: 0.25,
    blastTailSec: 0.44,
    crackCutoffHz: 3050,
    peakGain: 0.82,
    brakeRoarGain: 0.28,
    casingRingHz: 2720,
    mechanismStyle: 'long_stroke_piston',
  },
  '556_nato': {
    caliber: '556_nato',
    labelEn: '5.56×45mm NATO',
    labelZh: '5.56×45mm NATO 小口径高速弹',
    subFreqHz: 84,
    punchDecaySec: 0.2,
    blastTailSec: 0.36,
    crackCutoffHz: 3680,
    peakGain: 0.77,
    brakeRoarGain: 0.22,
    casingRingHz: 3080,
    mechanismStyle: 'gas_carbine',
  },
  '9mm_para': {
    caliber: '9mm_para',
    labelEn: '9×19mm Parabellum',
    labelZh: '9×19mm 帕拉贝鲁姆手枪弹',
    subFreqHz: 118,
    punchDecaySec: 0.13,
    blastTailSec: 0.22,
    crackCutoffHz: 4450,
    peakGain: 0.67,
    brakeRoarGain: 0.11,
    casingRingHz: 3560,
    mechanismStyle: 'compact_9mm',
  },
};

export type FiringSoundEventKind =
  | 'sear_release'
  | 'primer_ignition'
  | 'gas_or_recoil'
  | 'cam_unlock'
  | 'extract_eject'
  | 'spring_feed'
  | 'battery_lockup'
  | 'sear_reset';

export interface FiringSoundCue {
  kind: FiringSoundEventKind;
  at: number;
}

export type WorkbenchFoleyKind =
  | 'part_select'
  | 'preset_detent'
  | 'toggle_switch'
  | 'director_cue';

const FALLBACK_FIRING_CUES: readonly FiringSoundCue[] = [
  { kind: 'sear_release', at: 0.02 },
  { kind: 'primer_ignition', at: 0.16 },
  { kind: 'gas_or_recoil', at: 0.25 },
  { kind: 'cam_unlock', at: 0.36 },
  { kind: 'extract_eject', at: 0.5 },
  { kind: 'spring_feed', at: 0.64 },
  { kind: 'battery_lockup', at: 0.8 },
  { kind: 'sear_reset', at: 0.9 },
];

/**
 * Computes deterministic 8-point mechanical & ballistic acoustic trigger thresholds
 * aligned 1:1 with a weapon plugin's 7-stage `firingPhases` ranges.
 */
export function computeWeaponFiringSoundCues(
  phases: readonly FiringPhaseInfo[] | undefined
): readonly FiringSoundCue[] {
  if (!phases || phases.length < 7) {
    return FALLBACK_FIRING_CUES;
  }

  const lerpRange = (p: FiringPhaseInfo, alpha: number): number => {
    const start = p.range[0];
    const end = Math.max(start + 0.01, p.range[1]);
    return Math.min(0.995, Math.max(0.005, start + (end - start) * alpha));
  };

  const raw: FiringSoundCue[] = [
    { kind: 'sear_release', at: lerpRange(phases[0], 0.14) },
    { kind: 'primer_ignition', at: lerpRange(phases[1], 0.12) },
    { kind: 'gas_or_recoil', at: lerpRange(phases[2], 0.22) },
    { kind: 'cam_unlock', at: lerpRange(phases[3], 0.2) },
    { kind: 'extract_eject', at: lerpRange(phases[4], 0.28) },
    { kind: 'spring_feed', at: lerpRange(phases[5], 0.16) },
    { kind: 'battery_lockup', at: lerpRange(phases[5], 0.76) },
    { kind: 'sear_reset', at: lerpRange(phases[6], 0.35) },
  ];

  raw.sort((a, b) => a.at - b.at);
  return raw;
}

/**
 * Pure threshold-crossing detector supporting both monotonic forward progress
 * and continuous firing loop wraparound (`prevF > 0.85 -> nextF < 0.2`).
 */
export function detectCrossedFiringCues(
  cues: readonly FiringSoundCue[],
  prevF: number,
  nextF: number
): FiringSoundCue[] {
  if (nextF === prevF) return [];

  // Continuous loop wraparound (e.g. 0.98 -> 0.03)
  if (nextF < prevF) {
    if (prevF > 0.82 && nextF > 0 && nextF < 0.25) {
      return cues.filter((c) => c.at > prevF || c.at <= nextF);
    }
    return [];
  }

  // Guard abnormally huge jumps (> 0.45 in one tick) as state resets rather than sweeps
  if (nextF - prevF > 0.45) {
    return [];
  }

  return cues.filter((c) => c.at > prevF && c.at <= nextF);
}

/**
 * Returns master ducking multiplier (`0.24` ≈ -12.4 dB) when Gemini TTS voice
 * narration is actively speaking so mechanical/ballistic SFX never mask speech.
 */
export function computeNarrationDuckingGain(narrationPlaying: boolean): number {
  return narrationPlaying ? 0.24 : 1.0;
}

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

class ProceduralGunsmithSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private duckingGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private saturatorCurve: Float32Array | null = null;
  private lastScrubSoundMs = 0;

  private getAudioContextConstructor(): typeof AudioContext | null {
    if (typeof window === 'undefined') return null;
    return (
      window.AudioContext ??
      (window as WebkitWindow).webkitAudioContext ??
      null
    );
  }

  public unlock(): AudioContext | null {
    if (useAppStore.getState().sfxMuted) {
      return null;
    }
    const Ctor = this.getAudioContextConstructor();
    if (!Ctor) return null;

    if (!this.ctx) {
      try {
        const ctx = new Ctor();
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -10;
        compressor.knee.value = 14;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.002;
        compressor.release.value = 0.14;

        const duckingGain = ctx.createGain();
        duckingGain.gain.value = computeNarrationDuckingGain(
          getNarrationAudioSnapshot().isPlaying
        );

        const masterGain = ctx.createGain();
        masterGain.gain.value = useAppStore.getState().sfxMuted ? 0 : 0.88;

        duckingGain.connect(compressor);
        compressor.connect(masterGain);
        masterGain.connect(ctx.destination);

        this.ctx = ctx;
        this.duckingGain = duckingGain;
        this.masterGain = masterGain;
        this.noiseBuffer = this.buildNoiseBuffer(ctx);
        this.saturatorCurve = this.buildSaturationCurve();
      } catch {
        return null;
      }
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public syncGainStates(muted: boolean, narrationPlaying: boolean): void {
    if (!this.ctx || !this.masterGain || !this.duckingGain) return;
    const now = this.ctx.currentTime;
    const targetMaster = muted ? 0 : 0.88;
    const targetDuck = computeNarrationDuckingGain(narrationPlaying);
    this.masterGain.gain.setTargetAtTime(targetMaster, now, 0.03);
    this.duckingGain.gain.setTargetAtTime(
      targetDuck,
      now,
      narrationPlaying ? 0.05 : 0.14
    );
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 1.4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Deterministic xorshift32 PRNG for crisp broadband acoustic noise (zero GC per shot)
    let seed = 0x6d2b79f5;
    for (let i = 0; i < length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      data[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
    }
    return buffer;
  }

  private buildSaturationCurve(): Float32Array {
    const samples = 256;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1;
      curve[i] = Math.tanh(x * 2.6);
    }
    return curve;
  }

  private emitNoiseBurst(opts: {
    startTime: number;
    duration: number;
    filterType: BiquadFilterType;
    freqStart: number;
    freqEnd?: number;
    q?: number;
    gainPeak: number;
    attack?: number;
    saturate?: boolean;
  }): void {
    const ctx = this.ctx;
    const dest = this.duckingGain;
    const noiseBuf = this.noiseBuffer;
    if (!ctx || !dest || !noiseBuf) return;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    // Offset randomly within pre-built buffer so consecutive bursts never phase-comb
    const maxOffset = Math.max(0, noiseBuf.duration - opts.duration - 0.05);
    const offset = maxOffset > 0 ? (opts.startTime * 0.37) % maxOffset : 0;

    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType;
    filter.Q.setValueAtTime(opts.q ?? 1.2, opts.startTime);
    filter.frequency.setValueAtTime(
      Math.max(24, opts.freqStart),
      opts.startTime
    );
    if (opts.freqEnd !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(24, opts.freqEnd),
        opts.startTime + opts.duration
      );
    }

    const env = ctx.createGain();
    const attack = opts.attack ?? 0.0018;
    env.gain.setValueAtTime(0.0001, opts.startTime);
    env.gain.linearRampToValueAtTime(opts.gainPeak, opts.startTime + attack);
    env.gain.exponentialRampToValueAtTime(
      0.0001,
      opts.startTime + Math.max(attack + 0.006, opts.duration)
    );

    src.connect(filter);
    if (opts.saturate && this.saturatorCurve) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.saturatorCurve;
      filter.connect(shaper);
      shaper.connect(env);
    } else {
      filter.connect(env);
    }
    env.connect(dest);

    src.start(opts.startTime, offset, opts.duration + 0.02);
    src.stop(opts.startTime + opts.duration + 0.03);
  }

  private emitModalPing(opts: {
    startTime: number;
    duration: number;
    freqStart: number;
    freqEnd?: number;
    type?: OscillatorType;
    gainPeak: number;
  }): void {
    const ctx = this.ctx;
    const dest = this.duckingGain;
    if (!ctx || !dest) return;

    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'triangle';
    osc.frequency.setValueAtTime(opts.freqStart, opts.startTime);
    if (opts.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, opts.freqEnd),
        opts.startTime + opts.duration
      );
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, opts.startTime);
    env.gain.linearRampToValueAtTime(opts.gainPeak, opts.startTime + 0.0012);
    env.gain.exponentialRampToValueAtTime(
      0.0001,
      opts.startTime + Math.max(0.008, opts.duration)
    );

    osc.connect(env);
    env.connect(dest);
    osc.start(opts.startTime);
    osc.stop(opts.startTime + opts.duration + 0.015);
  }

  public playFiringEvent(
    kind: FiringSoundEventKind,
    weaponId: WeaponId,
    speedMultiplier: 0.25 | 0.5 | 1.0
  ): void {
    if (useAppStore.getState().sfxMuted) return;
    const ctx = this.unlock();
    if (!ctx || ctx.state !== 'running') return;

    const manifest = getWeaponManifest(weaponId);
    const profile = CALIBER_ACOUSTIC_PROFILES[manifest.caliberProfile];
    const now = ctx.currentTime + 0.002;
    const isSlowMo = speedMultiplier <= 0.25;

    switch (kind) {
      case 'sear_release': {
        // Hardened steel sear escapement click + hammer/striker spring release
        this.emitNoiseBurst({
          startTime: now,
          duration: 0.022,
          filterType: 'bandpass',
          freqStart: 3500,
          freqEnd: 2200,
          q: 4.5,
          gainPeak: 0.26,
        });
        this.emitModalPing({
          startTime: now,
          duration: 0.028,
          freqStart: 2850,
          freqEnd: 1680,
          type: 'triangle',
          gainPeak: 0.16,
        });
        break;
      }

      case 'primer_ignition': {
        // 1. Firing pin / striker sharp metallic impact on Boxer primer cup
        this.emitModalPing({
          startTime: now,
          duration: 0.024,
          freqStart: 3420,
          freqEnd: 2350,
          type: 'sine',
          gainPeak: 0.24,
        });
        this.emitNoiseBurst({
          startTime: now,
          duration: 0.016,
          filterType: 'bandpass',
          freqStart: 4800,
          q: 5.0,
          gainPeak: 0.22,
        });

        // 2. Propellant detonation + caliber-differentiated muzzle blast
        const blastDelay = isSlowMo ? 0.028 : 0.006;
        const tBlast = now + blastDelay;

        // Layer A: Sub-bass chamber pressure shockwave
        this.emitModalPing({
          startTime: tBlast,
          duration: profile.punchDecaySec,
          freqStart: profile.subFreqHz * 2.9,
          freqEnd: profile.subFreqHz,
          type: 'sine',
          gainPeak: profile.peakGain * 0.78,
        });

        // Layer B: Supersonic muzzle crack
        this.emitNoiseBurst({
          startTime: tBlast,
          duration: Math.min(0.085, profile.punchDecaySec * 0.42),
          filterType: 'bandpass',
          freqStart: profile.crackCutoffHz,
          freqEnd: profile.crackCutoffHz * 0.55,
          q: 1.1,
          gainPeak: profile.peakGain * 0.85,
          attack: 0.001,
          saturate: true,
        });

        // Layer C: Muzzle brake & expanding gas blast tail
        this.emitNoiseBurst({
          startTime: tBlast + 0.004,
          duration: profile.blastTailSec,
          filterType: 'lowpass',
          freqStart: profile.crackCutoffHz * 0.85,
          freqEnd: Math.max(95, profile.subFreqHz * 2.2),
          q: 0.85,
          gainPeak: 0.34 + profile.brakeRoarGain * 0.52,
          attack: 0.004,
          saturate: profile.brakeRoarGain > 0.3,
        });
        break;
      }

      case 'gas_or_recoil': {
        if (profile.mechanismStyle === 'short_recoil_heavy') {
          // M82A1 29-inch fluted barrel + dual recoil springs heavy rearward mass impulse
          this.emitModalPing({
            startTime: now,
            duration: 0.095,
            freqStart: 165,
            freqEnd: 68,
            type: 'triangle',
            gainPeak: 0.32,
          });
          this.emitNoiseBurst({
            startTime: now,
            duration: 0.075,
            filterType: 'bandpass',
            freqStart: 920,
            freqEnd: 480,
            q: 2.4,
            gainPeak: 0.24,
          });
        } else if (profile.mechanismStyle === 'bolt_action') {
          // AWM 60-degree bolt handle lift & primary extraction cam
          this.emitModalPing({
            startTime: now,
            duration: 0.045,
            freqStart: 1620,
            freqEnd: 1120,
            type: 'triangle',
            gainPeak: 0.22,
          });
        } else {
          // High-pressure gas port bleed tapping piston cup / Stoner gas key
          this.emitNoiseBurst({
            startTime: now,
            duration: 0.055,
            filterType: 'bandpass',
            freqStart: 2650,
            freqEnd: 1250,
            q: 2.2,
            gainPeak: 0.22,
          });
        }
        break;
      }

      case 'cam_unlock': {
        // Steel cam-pin / rotary bolt lugs / dual rollers / accelerator unlock clack
        const basePitch =
          profile.mechanismStyle === 'compact_9mm' ? 1960 : 1380;
        this.emitNoiseBurst({
          startTime: now,
          duration: 0.038,
          filterType: 'bandpass',
          freqStart: basePitch * 1.4,
          freqEnd: basePitch * 0.85,
          q: 3.6,
          gainPeak: 0.3,
        });
        this.emitModalPing({
          startTime: now,
          duration: 0.045,
          freqStart: basePitch,
          freqEnd: basePitch * 0.72,
          type: 'triangle',
          gainPeak: 0.22,
        });
        break;
      }

      case 'extract_eject': {
        // 1. Extractor claw pull + ejector spur kick
        this.emitNoiseBurst({
          startTime: now,
          duration: 0.045,
          filterType: 'bandpass',
          freqStart: 2900,
          freqEnd: 1700,
          q: 3.0,
          gainPeak: 0.25,
        });

        // 2. Spinning brass casing high-Q modal ring (3 inharmonic brass partials)
        const f0 = profile.casingRingHz;
        const ringStart = now + (isSlowMo ? 0.022 : 0.008);
        this.emitModalPing({
          startTime: ringStart,
          duration: 0.14,
          freqStart: f0,
          freqEnd: f0 * 0.985,
          type: 'sine',
          gainPeak: 0.12,
        });
        this.emitModalPing({
          startTime: ringStart,
          duration: 0.11,
          freqStart: f0 * 1.57,
          freqEnd: f0 * 1.55,
          type: 'sine',
          gainPeak: 0.08,
        });
        this.emitModalPing({
          startTime: ringStart,
          duration: 0.085,
          freqStart: f0 * 2.38,
          type: 'sine',
          gainPeak: 0.05,
        });

        // 3. Rear trunnion / buffer impact (including Colt M4A1 coaxial buffer spring ring)
        const tBuffer = now + (isSlowMo ? 0.04 : 0.016);
        this.emitModalPing({
          startTime: tBuffer,
          duration: 0.06,
          freqStart: 210,
          freqEnd: 92,
          type: 'triangle',
          gainPeak: 0.24,
        });
        if (weaponId === 'm4a1') {
          this.emitModalPing({
            startTime: tBuffer,
            duration: 0.16,
            freqStart: 415,
            freqEnd: 392,
            type: 'sine',
            gainPeak: 0.09,
          });
        }
        break;
      }

      case 'spring_feed': {
        // Multi-strand braided recoil spring metallic coil rasp + cartridge strip
        const dur = isSlowMo ? 0.12 : 0.065;
        this.emitNoiseBurst({
          startTime: now,
          duration: dur,
          filterType: 'bandpass',
          freqStart: 1850,
          freqEnd: 3300,
          q: 4.8,
          gainPeak: 0.2,
          attack: 0.008,
        });
        break;
      }

      case 'battery_lockup': {
        // Authoritative bolt-into-battery rotary lug lockup ("ka-chunk")
        const lockBase =
          profile.mechanismStyle === 'short_recoil_heavy' ? 980 : 1480;
        this.emitModalPing({
          startTime: now,
          duration: 0.048,
          freqStart: 245,
          freqEnd: 108,
          type: 'triangle',
          gainPeak: 0.28,
        });
        this.emitNoiseBurst({
          startTime: now + 0.008,
          duration: 0.036,
          filterType: 'bandpass',
          freqStart: lockBase * 1.35,
          freqEnd: lockBase * 0.9,
          q: 3.4,
          gainPeak: 0.32,
        });
        this.emitModalPing({
          startTime: now + 0.008,
          duration: 0.04,
          freqStart: lockBase,
          freqEnd: lockBase * 0.78,
          type: 'triangle',
          gainPeak: 0.22,
        });
        break;
      }

      case 'sear_reset': {
        // Tactile disconnector-to-primary-sear reset click
        this.emitNoiseBurst({
          startTime: now,
          duration: 0.018,
          filterType: 'bandpass',
          freqStart: 4200,
          freqEnd: 2900,
          q: 5.2,
          gainPeak: 0.22,
        });
        this.emitModalPing({
          startTime: now,
          duration: 0.02,
          freqStart: 3650,
          freqEnd: 2400,
          type: 'sine',
          gainPeak: 0.14,
        });
        break;
      }
    }
  }

  public playScrubCue(weaponId: WeaponId, progress: number): void {
    const nowMs =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - this.lastScrubSoundMs < 70) return;
    this.lastScrubSoundMs = nowMs;

    const plugin = getLoadedWeaponPlugin(weaponId);
    const cues = computeWeaponFiringSoundCues(plugin?.firingPhases);
    let nearest = cues[0];
    let bestDist = Math.abs(progress - nearest.at);
    for (let i = 1; i < cues.length; i++) {
      const dist = Math.abs(progress - cues[i].at);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = cues[i];
      }
    }
    // During manual slider scrubbing, avoid full muzzle boom unless clicking directly into ignition phase
    const scrubKind: FiringSoundEventKind =
      nearest.kind === 'primer_ignition' && bestDist > 0.04
        ? 'cam_unlock'
        : nearest.kind;
    this.playFiringEvent(scrubKind, weaponId, 0.25);
  }

  public playFoley(kind: WorkbenchFoleyKind): void {
    if (useAppStore.getState().sfxMuted) return;
    const ctx = this.unlock();
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime + 0.001;
    if (kind === 'part_select') {
      this.emitModalPing({
        startTime: now,
        duration: 0.018,
        freqStart: 2950,
        freqEnd: 1980,
        type: 'sine',
        gainPeak: 0.11,
      });
    } else if (kind === 'preset_detent') {
      this.emitNoiseBurst({
        startTime: now,
        duration: 0.02,
        filterType: 'bandpass',
        freqStart: 2600,
        freqEnd: 1650,
        q: 4.2,
        gainPeak: 0.15,
      });
    } else if (kind === 'director_cue') {
      this.emitModalPing({
        startTime: now,
        duration: 0.032,
        freqStart: 1480,
        freqEnd: 2220,
        type: 'sine',
        gainPeak: 0.08,
      });
    } else {
      this.emitModalPing({
        startTime: now,
        duration: 0.016,
        freqStart: 2350,
        freqEnd: 1550,
        type: 'triangle',
        gainPeak: 0.11,
      });
    }
  }
}

const soundEngine = new ProceduralGunsmithSoundEngine();

export function unlockMechanicalAudio(): void {
  soundEngine.unlock();
}

export function playWorkbenchFoley(kind: WorkbenchFoleyKind): void {
  soundEngine.playFoley(kind);
}

export function triggerManualPhasePreviewSound(
  weaponId: WeaponId,
  progress: number
): void {
  soundEngine.playScrubCue(weaponId, progress);
}

/**
 * Mounts once at the root `App` shell:
 * - Unlocks Web Audio on first user gesture
 * - Subscribes to transient 60Hz `playbackClock.subscribeFireProgress` with 0 React re-renders
 * - Applies automatic `-12.4 dB` Audio Ducking whenever Gemini TTS narration is speaking
 */
export function useMechanicalSoundEngine(): void {
  useEffect(() => {
    const onGesture = () => {
      soundEngine.unlock();
    };
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture, { passive: true });

    let prevFireProgress = playbackClock.getState().fireProgress;
    let prevWeaponId = useAppStore.getState().activeWeaponId;

    const unsubFire = playbackClock.subscribeFireProgress((nextF) => {
      const state = useAppStore.getState();
      if (state.activeWeaponId !== prevWeaponId) {
        prevWeaponId = state.activeWeaponId;
        prevFireProgress = nextF;
        return;
      }

      if (
        state.screen !== 'workbench' ||
        state.mode !== 'firing' ||
        state.sfxMuted
      ) {
        prevFireProgress = nextF;
        return;
      }

      if (!state.isFiringPlaying) {
        prevFireProgress = nextF;
        return;
      }

      const plugin = getLoadedWeaponPlugin(state.activeWeaponId);
      const cues = computeWeaponFiringSoundCues(plugin?.firingPhases);
      const crossed = detectCrossedFiringCues(cues, prevFireProgress, nextF);
      prevFireProgress = nextF;

      for (let i = 0; i < crossed.length; i++) {
        soundEngine.playFiringEvent(
          crossed[i].kind,
          state.activeWeaponId,
          state.fireSpeedMultiplier
        );
      }
    });

    const syncDuckingAndMute = () => {
      const sfxMuted = useAppStore.getState().sfxMuted;
      const narrationPlaying = getNarrationAudioSnapshot().isPlaying;
      soundEngine.syncGainStates(sfxMuted, narrationPlaying);
    };

    const unsubAudio = subscribeAudioPlayer(syncDuckingAndMute);

    let prevSelectedPart = useAppStore.getState().selectedPartId;
    let prevSectionCut = useAppStore.getState().sectionCut;
    let prevXray = useAppStore.getState().xrayShells;
    let prevMuted = useAppStore.getState().sfxMuted;

    const unsubStore = useAppStore.subscribe((state) => {
      if (state.sfxMuted !== prevMuted) {
        prevMuted = state.sfxMuted;
        syncDuckingAndMute();
        if (!state.sfxMuted) {
          soundEngine.playFoley('toggle_switch');
        }
      }

      if (state.screen !== 'workbench' || state.sfxMuted) {
        prevSelectedPart = state.selectedPartId;
        prevSectionCut = state.sectionCut;
        prevXray = state.xrayShells;
        return;
      }

      if (
        state.selectedPartId !== prevSelectedPart &&
        state.selectedPartId !== null
      ) {
        soundEngine.playFoley('part_select');
      } else if (
        state.sectionCut !== prevSectionCut ||
        state.xrayShells !== prevXray
      ) {
        soundEngine.playFoley('toggle_switch');
      }

      prevSelectedPart = state.selectedPartId;
      prevSectionCut = state.sectionCut;
      prevXray = state.xrayShells;
    });

    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      unsubFire();
      unsubAudio();
      unsubStore();
    };
  }, []);
}
