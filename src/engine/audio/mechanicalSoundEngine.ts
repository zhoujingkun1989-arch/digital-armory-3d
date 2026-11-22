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
import {
  isArcheryCaliber,
  isArcheryWeapon,
  isTankCaliber,
  isTankWeapon,
} from '../physics/armoryPhysics';
import {
  ACOUSTIC_ENVIRONMENT_CONFIGS,
  ACOUSTIC_ENVIRONMENT_PRESETS,
  type AcousticEnvironmentPreset,
  computeDynamicWetSendGain,
  getOrCreateAcousticImpulseBuffer,
  isAcousticEnvironmentPreset,
} from './acousticImpulse';

export {
  ACOUSTIC_ENVIRONMENT_CONFIGS,
  ACOUSTIC_ENVIRONMENT_PRESETS,
  type AcousticEnvironmentPreset,
};

export type MechanismAcousticStyle =
  | 'long_stroke_piston'
  | 'open_bolt_lmg'
  | 'gas_carbine'
  | 'pdw_blowback'
  | 'super_v_smg'
  | 'compact_9mm'
  | 'toggle_lock_pistol'
  | 'short_recoil_heavy'
  | 'bolt_action'
  | 'gas_magnum_pistol'
  | 'revolver_magnum'
  | 'argo_shotgun'
  | 'garand_enbloc'
  | 'caseless_clockwork'
  | 'integral_suppressed'
  | 'electric_gatling'
  | 'pulley_hyperburst'
  | 'compound_bow'
  | 'compound_crossbow'
  | 'tank_autoloader_cannon'
  | 'tank_bustle_cannon'
  | 'tank_ww2_cannon';

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
  '57_28': {
    caliber: '57_28',
    labelEn: '5.7×28mm FN SS190',
    labelZh: '5.7×28mm FN 高速穿甲防卫弹',
    subFreqHz: 102,
    punchDecaySec: 0.16,
    blastTailSec: 0.28,
    crackCutoffHz: 4820,
    peakGain: 0.72,
    brakeRoarGain: 0.16,
    casingRingHz: 3820,
    mechanismStyle: 'pdw_blowback',
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
  '45_acp': {
    caliber: '45_acp',
    labelEn: '.45 ACP (11.43x23mm) 230gr FMJ',
    labelZh: '.45 ACP 230格令亚音速大口径手枪弹',
    subFreqHz: 76,
    punchDecaySec: 0.23,
    blastTailSec: 0.38,
    crackCutoffHz: 1960,
    peakGain: 0.79,
    brakeRoarGain: 0.14,
    casingRingHz: 2840,
    mechanismStyle: 'super_v_smg',
  },
  arrow_400gr: {
    caliber: 'arrow_400gr',
    labelEn: '400gr Carbon Arrow · 348 FPS',
    labelZh: '400格令 碳纤维猎箭 · 348 FPS',
    subFreqHz: 54,
    punchDecaySec: 0.14,
    blastTailSec: 0.24,
    crackCutoffHz: 1850,
    peakGain: 0.56,
    brakeRoarGain: 0.0,
    casingRingHz: 920,
    mechanismStyle: 'compound_bow',
  },
  bolt_400gr: {
    caliber: 'bolt_400gr',
    labelEn: '400gr Crossbow Bolt · 500 FPS',
    labelZh: '400格令 碳素弩箭 · 500 FPS',
    subFreqHz: 46,
    punchDecaySec: 0.18,
    blastTailSec: 0.3,
    crackCutoffHz: 2450,
    peakGain: 0.68,
    brakeRoarGain: 0.0,
    casingRingHz: 1140,
    mechanismStyle: 'compound_crossbow',
  },
  '357_magnum': {
    caliber: '357_magnum',
    labelEn: '.357 Magnum 158gr JSP',
    labelZh: '.357 马格南凸缘转轮手枪弹',
    subFreqHz: 74,
    punchDecaySec: 0.24,
    blastTailSec: 0.42,
    crackCutoffHz: 3420,
    peakGain: 0.82,
    brakeRoarGain: 0.24,
    casingRingHz: 2980,
    mechanismStyle: 'revolver_magnum',
  },
  '12_gauge': {
    caliber: '12_gauge',
    labelEn: '12 Gauge 2.75" 00 Buckshot',
    labelZh: '12号 70mm 00号军用鹿弹',
    subFreqHz: 52,
    punchDecaySec: 0.34,
    blastTailSec: 0.58,
    crackCutoffHz: 2180,
    peakGain: 0.89,
    brakeRoarGain: 0.32,
    casingRingHz: 1920,
    mechanismStyle: 'argo_shotgun',
  },
  '30_06': {
    caliber: '30_06',
    labelEn: '.30-06 Springfield M2 Ball',
    labelZh: '.30-06 春田全威力步枪弹',
    subFreqHz: 56,
    punchDecaySec: 0.33,
    blastTailSec: 0.6,
    crackCutoffHz: 2680,
    peakGain: 0.9,
    brakeRoarGain: 0.3,
    casingRingHz: 2380,
    mechanismStyle: 'garand_enbloc',
  },
  '473_caseless': {
    caliber: '473_caseless',
    labelEn: '4.73×33mm DM11 Caseless',
    labelZh: '4.73×33mm DM11 高温无壳步枪弹',
    subFreqHz: 92,
    punchDecaySec: 0.18,
    blastTailSec: 0.32,
    crackCutoffHz: 4100,
    peakGain: 0.72,
    brakeRoarGain: 0.18,
    casingRingHz: 0,
    mechanismStyle: 'caseless_clockwork',
  },
  '9x39_subsonic': {
    caliber: '9x39_subsonic',
    labelEn: '9×39mm SP-6 Subsonic AP',
    labelZh: '9×39mm SP-6 微声亚音速穿甲弹',
    subFreqHz: 86,
    punchDecaySec: 0.14,
    blastTailSec: 0.18,
    crackCutoffHz: 1120,
    peakGain: 0.34,
    brakeRoarGain: 0.08,
    casingRingHz: 2680,
    mechanismStyle: 'integral_suppressed',
  },
  '762_nato': {
    caliber: '762_nato',
    labelEn: '7.62×51mm NATO M80 Ball',
    labelZh: '7.62×51mm NATO 全威力机枪弹',
    subFreqHz: 54,
    punchDecaySec: 0.32,
    blastTailSec: 0.56,
    crackCutoffHz: 2740,
    peakGain: 0.92,
    brakeRoarGain: 0.38,
    casingRingHz: 2320,
    mechanismStyle: 'electric_gatling',
  },
  '545_m74': {
    caliber: '545_m74',
    labelEn: '5.45×39mm 7N6 Soviet',
    labelZh: '5.45×39mm 7N6 小口径高速弹',
    subFreqHz: 78,
    punchDecaySec: 0.21,
    blastTailSec: 0.38,
    crackCutoffHz: 3560,
    peakGain: 0.76,
    brakeRoarGain: 0.34,
    casingRingHz: 3020,
    mechanismStyle: 'pulley_hyperburst',
  },
  '125mm_apfsds': {
    caliber: '125mm_apfsds',
    labelEn: '125mm DTC10-125 APFSDS-T',
    labelZh: '125mm 三期钨合金尾翼稳定脱壳穿甲弹',
    subFreqHz: 24,
    punchDecaySec: 0.85,
    blastTailSec: 1.45,
    crackCutoffHz: 920,
    peakGain: 1.0,
    brakeRoarGain: 0.74,
    casingRingHz: 620,
    mechanismStyle: 'tank_autoloader_cannon',
  },
  '120mm_apfsds': {
    caliber: '120mm_apfsds',
    labelEn: '120×570mm NATO APFSDS-T',
    labelZh: '120×570mm NATO 尾翼稳定脱壳穿甲弹',
    subFreqHz: 26,
    punchDecaySec: 0.82,
    blastTailSec: 1.4,
    crackCutoffHz: 980,
    peakGain: 1.0,
    brakeRoarGain: 0.7,
    casingRingHz: 660,
    mechanismStyle: 'tank_bustle_cannon',
  },
  '88mm_pzgr39': {
    caliber: '88mm_pzgr39',
    labelEn: '88×571mmR PzGr. 39 APCBC-HE',
    labelZh: '88×571mmR PzGr. 39 被帽风帽穿甲榴弹',
    subFreqHz: 31,
    punchDecaySec: 0.72,
    blastTailSec: 1.25,
    crackCutoffHz: 1180,
    peakGain: 0.96,
    brakeRoarGain: 0.85,
    casingRingHz: 840,
    mechanismStyle: 'tank_ww2_cannon',
  },
};

/**
 * High-Q inharmonic Euler-Bernoulli 1095 spring-steel U-clip eigenfrequencies (Hz)
 * for the iconic WWII U.S. Rifle M1 Garand 8-round en-bloc clip ejection "PING!".
 */
export const GARAND_ENBLOC_PING_PARTIALS_HZ = [
  1740, 3510, 5260, 6890,
] as const;

/** Stretched partials for high-tension braided BCY-X bowstrings. */
const BOWSTRING_TWANG_PARTIALS = [1.0, 2.04, 3.11, 4.24] as const;

/**
 * Exact Euler-Bernoulli free-free ordnance steel bar transverse eigenfrequency
 * ratios ((beta_n / beta_1)^2: 4.730^2 : 7.853^2 : 10.996^2 : 14.137^2).
 */
export const STEEL_BAR_EULER_BERNOULLI_PARTIALS = [
  1.0, 2.756, 5.404, 8.933,
] as const;

/**
 * Thin-walled drawn C26000 cartridge brass shell hoop/bell modal ratios.
 */
const BRASS_CASING_SHELL_PARTIALS = [1.0, 1.583, 2.392, 3.418] as const;

export interface SteelWaveguidePartialSpec {
  ratio: number;
  freqHz: number;
  decaySec: number;
  relativeGain: number;
}

/**
 * Computes Euler-Bernoulli cold-forged steel waveguide modal parameters with
 * thermoelastic high-mode rapid damping so machined bolts, sears & slides
 * exhibit crisp metallic bite without electronic sine-wave ring.
 */
export function computeSteelWaveguideModalSpec(
  fundamentalHz: number,
  baseDecaySec: number,
  strikeHardness01 = 0.7
): SteelWaveguidePartialSpec[] {
  const h = Math.max(0, Math.min(1, strikeHardness01));
  const f0 = Math.max(80, fundamentalHz);
  const baseDur = Math.max(0.01, baseDecaySec);
  const baseWeights = [1.0, 0.54, 0.29, 0.15] as const;

  return STEEL_BAR_EULER_BERNOULLI_PARTIALS.map((ratio, idx) => {
    const hardnessBoost = idx === 0 ? 1.0 : 0.45 + h * (0.55 + idx * 0.16);
    return {
      ratio,
      freqHz: f0 * ratio,
      decaySec: Math.max(0.006, baseDur / (1 + idx * 1.75)),
      relativeGain: baseWeights[idx] * hardnessBoost,
    };
  });
}

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

export type PressCheckDirection = 'pull' | 'release' | 'back' | 'forward';

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

type RoutingBus = 'mechanical' | 'ballistic' | 'dry_only';

class ProceduralGunsmithSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private mediaDest: MediaStreamAudioDestinationNode | null = null;
  private duckingGain: GainNode | null = null;
  private dryBus: GainNode | null = null;
  private mechanicalWetSend: GainNode | null = null;
  private ballisticWetSend: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private wetReturnGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private saturatorCurve: Float32Array | null = null;
  private lastScrubSoundMs = 0;
  private environmentPreset: AcousticEnvironmentPreset = 'tactical_hall';
  private activeSpeedMultiplier: 0.25 | 0.5 | 1.0 = 1.0;

  private getAudioContextConstructor(): typeof AudioContext | null {
    if (typeof window === 'undefined') return null;
    return (
      window.AudioContext ??
      (window as WebkitWindow).webkitAudioContext ??
      null
    );
  }

  public getEnvironment(): AcousticEnvironmentPreset {
    return this.environmentPreset;
  }

  public setEnvironment(preset: AcousticEnvironmentPreset): void {
    if (!isAcousticEnvironmentPreset(preset)) return;
    this.environmentPreset = preset;
    if (!this.ctx || !this.convolver || !this.wetReturnGain) return;

    try {
      this.convolver.buffer = getOrCreateAcousticImpulseBuffer(
        this.ctx,
        preset
      );
      const targetWet = computeDynamicWetSendGain(
        preset,
        this.activeSpeedMultiplier
      );
      this.wetReturnGain.gain.setTargetAtTime(
        targetWet,
        this.ctx.currentTime,
        0.025
      );
    } catch {
      // Non-fatal in constrained audio contexts
    }
  }

  public syncSpeedWetMix(speedMultiplier: 0.25 | 0.5 | 1.0): void {
    this.activeSpeedMultiplier = speedMultiplier;
    if (!this.ctx || !this.wetReturnGain) return;
    const targetWet = computeDynamicWetSendGain(
      this.environmentPreset,
      speedMultiplier
    );
    this.wetReturnGain.gain.setTargetAtTime(
      targetWet,
      this.ctx.currentTime,
      0.02
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

        // Dry + Stereo ConvolverNode Wet Send Bus Architecture
        const dryBus = ctx.createGain();
        dryBus.gain.value = 1.0;

        const mechanicalWetSend = ctx.createGain();
        mechanicalWetSend.gain.value = 0.42;

        const ballisticWetSend = ctx.createGain();
        ballisticWetSend.gain.value = 1.0;

        const convolver = ctx.createConvolver();
        convolver.normalize = false;
        convolver.buffer = getOrCreateAcousticImpulseBuffer(
          ctx,
          this.environmentPreset
        );

        const wetReturnGain = ctx.createGain();
        wetReturnGain.gain.value = computeDynamicWetSendGain(
          this.environmentPreset,
          this.activeSpeedMultiplier
        );

        dryBus.connect(duckingGain);
        mechanicalWetSend.connect(convolver);
        ballisticWetSend.connect(convolver);
        convolver.connect(wetReturnGain);
        wetReturnGain.connect(duckingGain);

        duckingGain.connect(compressor);
        compressor.connect(masterGain);
        masterGain.connect(ctx.destination);

        this.ctx = ctx;
        this.dryBus = dryBus;
        this.mechanicalWetSend = mechanicalWetSend;
        this.ballisticWetSend = ballisticWetSend;
        this.convolver = convolver;
        this.wetReturnGain = wetReturnGain;
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

  public getRecordingAudioStream(): MediaStream | null {
    const ctx = this.unlock();
    if (!ctx || !this.masterGain) return null;
    if (typeof ctx.createMediaStreamDestination !== 'function') return null;
    if (!this.mediaDest) {
      try {
        const dest = ctx.createMediaStreamDestination();
        this.mediaDest = dest;
        this.masterGain.connect(dest);
      } catch {
        this.mediaDest = null;
        return null;
      }
    }
    return this.mediaDest.stream;
  }

  private connectToBus(node: AudioNode, bus: RoutingBus): void {
    if (!this.dryBus) return;
    node.connect(this.dryBus);
    if (bus === 'ballistic' && this.ballisticWetSend) {
      node.connect(this.ballisticWetSend);
    } else if (bus === 'mechanical' && this.mechanicalWetSend) {
      node.connect(this.mechanicalWetSend);
    }
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
    bus?: RoutingBus;
  }): void {
    const ctx = this.ctx;
    const noiseBuf = this.noiseBuffer;
    if (!ctx || !this.dryBus || !noiseBuf) return;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const maxOffset = Math.max(0, noiseBuf.duration - opts.duration - 0.05);
    const offset = maxOffset > 0 ? (opts.startTime * 0.37) % maxOffset : 0;

    const nyquistSafe = ctx.sampleRate * 0.45;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType;
    filter.Q.setValueAtTime(opts.q ?? 1.2, opts.startTime);
    filter.frequency.setValueAtTime(
      Math.min(nyquistSafe, Math.max(24, opts.freqStart)),
      opts.startTime
    );
    if (opts.freqEnd !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.min(nyquistSafe, Math.max(24, opts.freqEnd)),
        opts.startTime + opts.duration
      );
    }

    const env = ctx.createGain();
    const attack = opts.attack ?? 0.0014;
    env.gain.setValueAtTime(0.0001, opts.startTime);
    env.gain.linearRampToValueAtTime(
      Math.max(0.0002, opts.gainPeak),
      opts.startTime + attack
    );
    env.gain.exponentialRampToValueAtTime(
      0.0001,
      opts.startTime + Math.max(attack + 0.005, opts.duration)
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
    this.connectToBus(env, opts.bus ?? 'mechanical');

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
    bus?: RoutingBus;
  }): void {
    const ctx = this.ctx;
    if (!ctx || !this.dryBus) return;

    const nyquistSafe = ctx.sampleRate * 0.46;
    if (opts.freqStart > nyquistSafe) return;

    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(20, opts.freqStart), opts.startTime);
    if (opts.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.min(nyquistSafe, Math.max(20, opts.freqEnd)),
        opts.startTime + opts.duration
      );
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, opts.startTime);
    env.gain.linearRampToValueAtTime(
      Math.max(0.0002, opts.gainPeak),
      opts.startTime + 0.001
    );
    env.gain.exponentialRampToValueAtTime(
      0.0001,
      opts.startTime + Math.max(0.006, opts.duration)
    );

    osc.connect(env);
    this.connectToBus(env, opts.bus ?? 'mechanical');
    osc.start(opts.startTime);
    osc.stop(opts.startTime + opts.duration + 0.015);
  }

  /**
   * Synthesizes a Cold-Forged Ordnance Steel impact using Euler-Bernoulli
   * inharmonic bar modes (`[1.0, 2.756, 5.404, 8.933]`) with rapid high-mode
   * damping + saturated broadband contact transient + optional heavy billet mass thud.
   */
  private emitSteelWaveguideStrike(opts: {
    startTime: number;
    fundamentalHz: number;
    baseDecaySec: number;
    gainPeak: number;
    hardness01?: number;
    massBodyHz?: number;
    bus?: RoutingBus;
  }): void {
    const ctx = this.ctx;
    if (!ctx || !this.dryBus) return;

    const hardness = opts.hardness01 ?? 0.72;
    const bus = opts.bus ?? 'mechanical';
    const nyquistSafe = ctx.sampleRate * 0.46;

    // 1. Short filtered metal-on-metal micro-contact transient burst
    this.emitNoiseBurst({
      startTime: opts.startTime,
      duration: 0.0045 + (1 - hardness) * 0.004,
      filterType: 'bandpass',
      freqStart: Math.min(
        nyquistSafe,
        opts.fundamentalHz * (1.85 + hardness * 1.35)
      ),
      freqEnd: Math.min(nyquistSafe, opts.fundamentalHz * 1.15),
      q: 3.4 + hardness * 2.2,
      gainPeak: opts.gainPeak * (0.72 + hardness * 0.36),
      attack: 0.0006,
      saturate: true,
      bus,
    });

    // 2. Optional machined steel billet / receiver body mass impulse
    if (opts.massBodyHz !== undefined && opts.massBodyHz > 30) {
      this.emitModalPing({
        startTime: opts.startTime,
        duration: Math.min(0.065, opts.baseDecaySec * 0.85),
        freqStart: opts.massBodyHz * 1.45,
        freqEnd: opts.massBodyHz,
        type: 'triangle',
        gainPeak: opts.gainPeak * 0.56,
        bus,
      });
    }

    // 3. 4-Mode Euler-Bernoulli Inharmonic Steel Waveguide Resonator
    const partials = computeSteelWaveguideModalSpec(
      opts.fundamentalHz,
      opts.baseDecaySec,
      hardness
    );

    for (let i = 0; i < partials.length; i++) {
      const p = partials[i];
      if (p.freqHz > nyquistSafe) continue;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      // Nonlinear Hertzian contact stiffness micro-chirp on initial 3.5ms impact
      osc.frequency.setValueAtTime(
        Math.min(nyquistSafe, p.freqHz * 1.012),
        opts.startTime
      );
      osc.frequency.exponentialRampToValueAtTime(
        p.freqHz,
        opts.startTime + Math.min(0.004, p.decaySec * 0.4)
      );

      const env = ctx.createGain();
      const modePeak = opts.gainPeak * 0.46 * p.relativeGain;
      env.gain.setValueAtTime(0.0001, opts.startTime);
      env.gain.linearRampToValueAtTime(
        Math.max(0.0002, modePeak),
        opts.startTime + 0.0007
      );
      env.gain.exponentialRampToValueAtTime(
        0.0001,
        opts.startTime + p.decaySec
      );

      osc.connect(env);
      this.connectToBus(env, bus);
      osc.start(opts.startTime);
      osc.stop(opts.startTime + p.decaySec + 0.01);
    }
  }

  public playFiringEvent(
    kind: FiringSoundEventKind,
    weaponId: WeaponId,
    speedMultiplier: 0.25 | 0.5 | 1.0
  ): void {
    if (useAppStore.getState().sfxMuted) return;
    const ctx = this.unlock();
    if (!ctx || ctx.state !== 'running') return;

    this.syncSpeedWetMix(speedMultiplier);

    const manifest = getWeaponManifest(weaponId);
    const profile = CALIBER_ACOUSTIC_PROFILES[manifest.caliberProfile];
    const now = ctx.currentTime + 0.002;
    const isSlowMo = speedMultiplier <= 0.25;

    if (
      profile.mechanismStyle === 'compound_bow' ||
      profile.mechanismStyle === 'compound_crossbow'
    ) {
      this.playArcheryFiringEvent(kind, profile, now, isSlowMo);
      return;
    }

    if (
      isTankWeapon(weaponId) ||
      isTankCaliber(manifest.caliberProfile)
    ) {
      this.playTankCannonFiringEvent(kind, weaponId, profile, now, isSlowMo);
      return;
    }

    switch (kind) {
      case 'sear_release': {
        if (profile.mechanismStyle === 'revolver_magnum') {
          // Colt Python 2-step Hand ratchet pawl 60° index click + zero-play Cylinder Bolt vault lock + V-spring break
          const indexGap = isSlowMo ? 0.028 : 0.013;
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 2780,
            baseDecaySec: 0.024,
            gainPeak: 0.2,
            hardness01: 0.88,
            bus: 'mechanical',
          });
          this.emitSteelWaveguideStrike({
            startTime: now + indexGap,
            fundamentalHz: 3180,
            baseDecaySec: 0.028,
            gainPeak: 0.24,
            hardness01: 0.92,
            massBodyHz: 360,
            bus: 'mechanical',
          });
          this.emitSteelWaveguideStrike({
            startTime: now + indexGap * 1.85,
            fundamentalHz: 1980,
            baseDecaySec: 0.034,
            gainPeak: 0.25,
            hardness01: 0.86,
            massBodyHz: 310,
            bus: 'mechanical',
          });
        } else if (weaponId === 'm249') {
          // M249 SAW heavy case-hardened open-bolt sear drop + captive driving spring forward surge
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 1480,
            baseDecaySec: 0.044,
            gainPeak: 0.28,
            hardness01: 0.88,
            massBodyHz: 215,
            bus: 'mechanical',
          });
          this.emitNoiseBurst({
            startTime: now + 0.004,
            duration: isSlowMo ? 0.085 : 0.048,
            filterType: 'bandpass',
            freqStart: 1620,
            freqEnd: 2940,
            q: 4.2,
            gainPeak: 0.17,
            attack: 0.004,
            bus: 'mechanical',
          });
        } else if (weaponId === 'm134') {
          // GE M134D 28V DC electric drive motor spin-up whine + 50 Hz rotary stator hum
          this.emitModalPing({
            startTime: now,
            duration: isSlowMo ? 0.16 : 0.095,
            freqStart: 320,
            freqEnd: 640,
            type: 'triangle',
            gainPeak: 0.24,
            bus: 'mechanical',
          });
          this.emitNoiseBurst({
            startTime: now + 0.005,
            duration: isSlowMo ? 0.14 : 0.085,
            filterType: 'bandpass',
            freqStart: 880,
            freqEnd: 1840,
            q: 5.5,
            gainPeak: 0.16,
            attack: 0.008,
            bus: 'mechanical',
          });
        } else if (weaponId === 'vss') {
          // VSS Vintorez hammerless silent linear striker glide (muted low-noise click!)
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 2480,
            baseDecaySec: 0.018,
            gainPeak: 0.11,
            hardness01: 0.72,
            bus: 'mechanical',
          });
        } else {
          // Hardened S7/4140 steel sear escapement snap + hammer/striker spring release
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 1920,
            baseDecaySec: 0.036,
            gainPeak: 0.27,
            hardness01: 0.86,
            massBodyHz: 310,
            bus: 'mechanical',
          });
        }
        break;
      }

      case 'primer_ignition': {
        // 1. Hardened steel firing pin / striker impact on Boxer brass primer cup
        this.emitSteelWaveguideStrike({
          startTime: now,
          fundamentalHz: 2340,
          baseDecaySec: 0.028,
          gainPeak: 0.25,
          hardness01: 0.92,
          bus: 'mechanical',
        });

        // 2. Propellant detonation + caliber-differentiated supersonic muzzle blast
        const blastDelay = isSlowMo ? 0.028 : 0.006;
        const tBlast = now + blastDelay;

        // Layer A: Sub-bass chamber pressure shockwave
        this.emitModalPing({
          startTime: tBlast,
          duration: profile.punchDecaySec,
          freqStart: profile.subFreqHz * 2.9,
          freqEnd: profile.subFreqHz,
          type: 'sine',
          gainPeak: profile.peakGain * 0.8,
          bus: 'ballistic',
        });

        // Layer B: Supersonic N-wave muzzle crack (excites room ConvolverNode slapback!)
        this.emitNoiseBurst({
          startTime: tBlast,
          duration: Math.min(0.085, profile.punchDecaySec * 0.42),
          filterType: 'bandpass',
          freqStart: profile.crackCutoffHz,
          freqEnd: profile.crackCutoffHz * 0.55,
          q: 1.05,
          gainPeak: profile.peakGain * 0.88,
          attack: 0.0008,
          saturate: true,
          bus: 'ballistic',
        });

        // Layer C: Muzzle brake & expanding gas blast tail
        this.emitNoiseBurst({
          startTime: tBlast + 0.004,
          duration: profile.blastTailSec,
          filterType: 'lowpass',
          freqStart: profile.crackCutoffHz * 0.85,
          freqEnd: Math.max(95, profile.subFreqHz * 2.2),
          q: 0.85,
          gainPeak: 0.35 + profile.brakeRoarGain * 0.52,
          attack: 0.0035,
          saturate: profile.brakeRoarGain > 0.3,
          bus: 'ballistic',
        });

        // Platform-signature ballistic harmonics (AN-94 1,800 RPM double-tap + brake whistle; M134 50Hz BRRRT buzz)
        if (weaponId === 'an94') {
          const dtHyper = isSlowMo ? 0.072 : 0.033;
          this.emitModalPing({
            startTime: tBlast + dtHyper,
            duration: 0.16,
            freqStart: profile.subFreqHz * 2.8,
            freqEnd: profile.subFreqHz,
            type: 'sine',
            gainPeak: profile.peakGain * 0.68,
            bus: 'ballistic',
          });
          this.emitNoiseBurst({
            startTime: tBlast + dtHyper,
            duration: 0.06,
            filterType: 'bandpass',
            freqStart: 3600,
            freqEnd: 1950,
            q: 1.2,
            gainPeak: profile.peakGain * 0.72,
            attack: 0.0008,
            saturate: true,
            bus: 'ballistic',
          });
          // Iconic figure-8 whistling dual-chamber brake air jet
          this.emitModalPing({
            startTime: tBlast + 0.008,
            duration: 0.095,
            freqStart: 2980,
            freqEnd: 2420,
            type: 'sine',
            gainPeak: 0.11,
            bus: 'ballistic',
          });
        } else if (weaponId === 'm134') {
          // Iconic 3,000 RPM (50 Hz) rotary Gatling "BRRRT!" cyclic pulse harmonic
          this.emitModalPing({
            startTime: tBlast + 0.006,
            duration: isSlowMo ? 0.14 : 0.08,
            freqStart: 52,
            freqEnd: 48,
            type: 'sawtooth',
            gainPeak: 0.28,
            bus: 'ballistic',
          });
        }
        break;
      }

      case 'gas_or_recoil': {
        if (profile.mechanismStyle === 'short_recoil_heavy') {
          // M82A1 29-inch fluted barrel + dual recoil springs heavy rearward mass impulse
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 620,
            baseDecaySec: 0.095,
            gainPeak: 0.32,
            hardness01: 0.62,
            massBodyHz: 112,
            bus: 'mechanical',
          });
        } else if (profile.mechanismStyle === 'bolt_action') {
          // AWM 60-degree steel bolt handle lift & primary extraction cam
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 1180,
            baseDecaySec: 0.052,
            gainPeak: 0.25,
            hardness01: 0.78,
            massBodyHz: 240,
            bus: 'mechanical',
          });
        } else if (profile.mechanismStyle === 'pdw_blowback') {
          // FN P90 heavy straight-blowback breech bolt impulse + dual guide-rod buffer thud
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 980,
            baseDecaySec: 0.054,
            gainPeak: 0.25,
            hardness01: 0.68,
            massBodyHz: 215,
            bus: 'mechanical',
          });
        } else if (profile.mechanismStyle === 'revolver_magnum') {
          // Colt Python radial forcing-cone cylinder-gap high-pressure gas flash hiss
          this.emitNoiseBurst({
            startTime: now,
            duration: 0.042,
            filterType: 'bandpass',
            freqStart: 3650,
            freqEnd: 1620,
            q: 1.9,
            gainPeak: 0.22,
            bus: 'ballistic',
          });
        } else if (profile.mechanismStyle === 'argo_shotgun') {
          // Benelli M4 twin stainless short-stroke ARGO tappet rods striking bolt carrier face
          this.emitNoiseBurst({
            startTime: now,
            duration: 0.045,
            filterType: 'bandpass',
            freqStart: 2650,
            freqEnd: 1240,
            q: 2.0,
            gainPeak: 0.22,
            bus: 'mechanical',
          });
          this.emitSteelWaveguideStrike({
            startTime: now + 0.002,
            fundamentalHz: 2860,
            baseDecaySec: 0.034,
            gainPeak: 0.22,
            hardness01: 0.9,
            massBodyHz: 320,
            bus: 'mechanical',
          });
          this.emitSteelWaveguideStrike({
            startTime: now + (isSlowMo ? 0.01 : 0.005),
            fundamentalHz: 3140,
            baseDecaySec: 0.03,
            gainPeak: 0.18,
            hardness01: 0.92,
            bus: 'mechanical',
          });
        } else if (
          weaponId === 'vector' ||
          profile.mechanismStyle === 'super_v_smg'
        ) {
          // KRISS Vector 1,200 RPM lateral bolt cam-trunnion transfer into -65° tungsten Super V slider plunge
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 1320,
            baseDecaySec: 0.046,
            gainPeak: 0.26,
            hardness01: 0.78,
            massBodyHz: 162,
            bus: 'mechanical',
          });
          this.emitModalPing({
            startTime: now + 0.004,
            duration: 0.055,
            freqStart: 185,
            freqEnd: 96,
            type: 'triangle',
            gainPeak: 0.19,
            bus: 'mechanical',
          });
        } else if (weaponId === 'p08') {
          // Luger P08 6.5mm barrel + forked extension short-recoil slide impulse prior to ramp contact
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 1580,
            baseDecaySec: 0.038,
            gainPeak: 0.21,
            hardness01: 0.84,
            massBodyHz: 265,
            bus: 'mechanical',
          });
        } else if (weaponId === 'g11') {
          // H&K G11 K2 2,100 RPM Swiss clockwork gear train rapid double-tick + floating recoil glide
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 3240,
            baseDecaySec: 0.022,
            gainPeak: 0.2,
            hardness01: 0.92,
            bus: 'mechanical',
          });
          this.emitSteelWaveguideStrike({
            startTime: now + (isSlowMo ? 0.016 : 0.007),
            fundamentalHz: 3780,
            baseDecaySec: 0.018,
            gainPeak: 0.16,
            hardness01: 0.94,
            bus: 'mechanical',
          });
        } else if (weaponId === 'vss') {
          // VSS Vintorez integral 6-stage slant baffle subsonic gas expansion whisper
          this.emitNoiseBurst({
            startTime: now,
            duration: 0.068,
            filterType: 'bandpass',
            freqStart: 1380,
            freqEnd: 460,
            q: 1.6,
            gainPeak: 0.16,
            bus: 'ballistic',
          });
        } else if (weaponId === 'an94') {
          // Nikonov AN-94 CNC grooved pulley & braided steel cable rapid pre-feed whirr
          this.emitNoiseBurst({
            startTime: now,
            duration: isSlowMo ? 0.065 : 0.036,
            filterType: 'bandpass',
            freqStart: 1920,
            freqEnd: 3420,
            q: 4.8,
            gainPeak: 0.2,
            bus: 'mechanical',
          });
          this.emitSteelWaveguideStrike({
            startTime: now + 0.004,
            fundamentalHz: 2260,
            baseDecaySec: 0.026,
            gainPeak: 0.19,
            hardness01: 0.88,
            bus: 'mechanical',
          });
        } else {
          // High-pressure gas port bleed tapping chromed steel piston cup / Stoner gas key
          this.emitNoiseBurst({
            startTime: now,
            duration: 0.048,
            filterType: 'bandpass',
            freqStart: 2750,
            freqEnd: 1280,
            q: 2.1,
            gainPeak: 0.22,
            bus: 'mechanical',
          });
          this.emitSteelWaveguideStrike({
            startTime: now + 0.002,
            fundamentalHz: 1460,
            baseDecaySec: 0.036,
            gainPeak: 0.16,
            hardness01: 0.74,
            bus: 'mechanical',
          });
        }
        break;
      }

      case 'cam_unlock': {
        if (profile.mechanismStyle === 'revolver_magnum') {
          // Revolver cylinder stays locked; subtle frame recoil settle only
          this.emitModalPing({
            startTime: now,
            duration: 0.045,
            freqStart: 220,
            freqEnd: 145,
            type: 'sine',
            gainPeak: 0.1,
            bus: 'mechanical',
          });
          break;
        }
        if (weaponId === 'p08') {
          // Luger P08 signature double-articulated metallic knee-toggle ramp strike + center-hinge buckle snap
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 2140,
            baseDecaySec: 0.042,
            gainPeak: 0.3,
            hardness01: 0.91,
            massBodyHz: 295,
            bus: 'mechanical',
          });
          this.emitSteelWaveguideStrike({
            startTime: now + (isSlowMo ? 0.018 : 0.009),
            fundamentalHz: 2680,
            baseDecaySec: 0.034,
            gainPeak: 0.24,
            hardness01: 0.93,
            bus: 'mechanical',
          });
          break;
        }
        // Steel cam-pin / rotary bolt lugs / dual rollers / accelerator unlock clack
        const basePitch =
          profile.mechanismStyle === 'compact_9mm'
            ? 1440
            : profile.mechanismStyle === 'short_recoil_heavy'
              ? 860
              : 1080;
        this.emitSteelWaveguideStrike({
          startTime: now,
          fundamentalHz: basePitch,
          baseDecaySec: 0.056,
          gainPeak: 0.31,
          hardness01: 0.82,
          massBodyHz: basePitch * 0.2,
          bus: 'mechanical',
        });
        break;
      }

      case 'extract_eject': {
        if (profile.mechanismStyle === 'revolver_magnum') {
          // Revolver retains brass inside the 6-shot cylinder; subtle V-mainspring & cylinder settle
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 2180,
            baseDecaySec: 0.022,
            gainPeak: 0.11,
            hardness01: 0.78,
            bus: 'mechanical',
          });
          break;
        }
        if (
          weaponId === 'g11' ||
          profile.mechanismStyle === 'caseless_clockwork'
        ) {
          // H&K G11 100% Caseless: ZERO brass extraction/ejection ring! Vertical rammer click + rubber buffer only.
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 2920,
            baseDecaySec: 0.024,
            gainPeak: 0.18,
            hardness01: 0.88,
            bus: 'mechanical',
          });
          this.emitModalPing({
            startTime: now + 0.012,
            duration: 0.052,
            freqStart: 138,
            freqEnd: 74,
            type: 'sine',
            gainPeak: 0.16,
            bus: 'mechanical',
          });
          break;
        }

        // 1. Extractor claw pull + steel ejector spur kick
        this.emitSteelWaveguideStrike({
          startTime: now,
          fundamentalHz: 1620,
          baseDecaySec: 0.042,
          gainPeak: 0.24,
          hardness01: 0.8,
          bus: 'mechanical',
        });

        // 2. Spinning drawn-brass casing shell resonance on deflector exit
        const f0 = profile.casingRingHz;
        const ringStart = now + (isSlowMo ? 0.022 : 0.008);
        for (let i = 0; i < BRASS_CASING_SHELL_PARTIALS.length; i++) {
          const ratio = BRASS_CASING_SHELL_PARTIALS[i];
          this.emitModalPing({
            startTime: ringStart,
            duration: 0.13 / (1 + i * 0.45),
            freqStart: f0 * ratio,
            freqEnd: f0 * ratio * 0.988,
            type: 'sine',
            gainPeak: (0.11 / (1 + i * 0.7)) * (isSlowMo ? 0.9 : 1.0),
            bus: 'mechanical',
          });
        }

        // 3. Rear trunnion / buffer impact (including Colt M4A1 buffer ring & WWII M1 Garand "PING!")
        const tBuffer = now + (isSlowMo ? 0.04 : 0.016);
        this.emitSteelWaveguideStrike({
          startTime: tBuffer,
          fundamentalHz: 740,
          baseDecaySec: 0.062,
          gainPeak: 0.24,
          hardness01: 0.6,
          massBodyHz: 138,
          bus: 'mechanical',
        });
        if (weaponId === 'm4a1') {
          this.emitModalPing({
            startTime: tBuffer,
            duration: 0.15,
            freqStart: 415,
            freqEnd: 394,
            type: 'sine',
            gainPeak: 0.075,
            bus: 'mechanical',
          });
        } else if (weaponId === 'm249') {
          // M249 SAW disintegrating M27 1075 spring-steel belt-link clink + PIP hydraulic buffer thud
          const tLink = now + (isSlowMo ? 0.028 : 0.011);
          this.emitSteelWaveguideStrike({
            startTime: tLink,
            fundamentalHz: 3280,
            baseDecaySec: 0.026,
            gainPeak: 0.18,
            hardness01: 0.93,
            bus: 'ballistic',
          });
          this.emitModalPing({
            startTime: tLink + 0.002,
            duration: 0.085,
            freqStart: 4180,
            freqEnd: 4120,
            type: 'sine',
            gainPeak: 0.11,
            bus: 'ballistic',
          });
          this.emitModalPing({
            startTime: tLink + 0.008,
            duration: 0.062,
            freqStart: 5740,
            freqEnd: 5680,
            type: 'sine',
            gainPeak: 0.075,
            bus: 'ballistic',
          });
        } else if (
          weaponId === 'vector' ||
          profile.mechanismStyle === 'super_v_smg'
        ) {
          // KRISS Vector -65° Super V tungsten counterweight slider bottoming on polyurethane guide-rod buffer
          this.emitModalPing({
            startTime: tBuffer,
            duration: 0.072,
            freqStart: 126,
            freqEnd: 68,
            type: 'sine',
            gainPeak: 0.24,
            bus: 'mechanical',
          });
        } else if (
          weaponId === 'garand' ||
          profile.mechanismStyle === 'garand_enbloc'
        ) {
          // Legendary WWII U.S. M1 Garand 1095 Spring-Steel En-Bloc Clip Ejection "PING!"
          const tPing = now + (isSlowMo ? 0.026 : 0.01);
          // Clip-latch release + ejector V-spring snap against stamped clip floor
          this.emitSteelWaveguideStrike({
            startTime: tPing,
            fundamentalHz: 2420,
            baseDecaySec: 0.036,
            gainPeak: 0.24,
            hardness01: 0.94,
            massBodyHz: 420,
            bus: 'ballistic',
          });
          // High-Q inharmonic Euler-Bernoulli spring-steel modal partials (~0.65s–0.92s decay)
          const pingDecays = [0.9, 0.78, 0.66, 0.54] as const;
          const pingWeights = [0.28, 0.22, 0.14, 0.085] as const;
          for (let i = 0; i < GARAND_ENBLOC_PING_PARTIALS_HZ.length; i++) {
            const fModal = GARAND_ENBLOC_PING_PARTIALS_HZ[i];
            this.emitModalPing({
              startTime: tPing + 0.0015,
              duration: pingDecays[i] * (isSlowMo ? 1.12 : 1.0),
              freqStart: fModal * 1.0035,
              freqEnd: fModal * 0.9975,
              type: 'sine',
              gainPeak: pingWeights[i],
              bus: 'ballistic',
            });
          }
        }
        break;
      }

      case 'spring_feed': {
        if (profile.mechanismStyle === 'revolver_magnum') {
          // Colt Rebound Lever sliding back beneath hammer safety stud
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 2520,
            baseDecaySec: 0.024,
            gainPeak: 0.15,
            hardness01: 0.85,
            bus: 'mechanical',
          });
          break;
        }
        // Multi-strand braided recoil spring metallic coil rasp + brass cartridge feed-lip strip
        const dur = isSlowMo ? 0.12 : 0.065;
        this.emitNoiseBurst({
          startTime: now,
          duration: dur,
          filterType: 'bandpass',
          freqStart: 1850,
          freqEnd: 3350,
          q: 4.6,
          gainPeak: 0.19,
          attack: 0.007,
          bus: 'mechanical',
        });
        this.emitSteelWaveguideStrike({
          startTime: now + dur * 0.35,
          fundamentalHz:
            profile.mechanismStyle === 'argo_shotgun' ? 1780 : 2120,
          baseDecaySec: 0.032,
          gainPeak: profile.mechanismStyle === 'argo_shotgun' ? 0.2 : 0.14,
          hardness01: 0.78,
          bus: 'mechanical',
        });
        if (profile.mechanismStyle === 'argo_shotgun') {
          // Benelli M4 stamped stainless shell-elevator upward carrier snap
          this.emitSteelWaveguideStrike({
            startTime: now + dur * 0.62,
            fundamentalHz: 2640,
            baseDecaySec: 0.026,
            gainPeak: 0.17,
            hardness01: 0.88,
            bus: 'mechanical',
          });
        }
        break;
      }

      case 'battery_lockup': {
        if (profile.mechanismStyle === 'revolver_magnum') {
          // Trigger forward return + hand pawl reset click
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 2340,
            baseDecaySec: 0.022,
            gainPeak: 0.14,
            hardness01: 0.84,
            bus: 'mechanical',
          });
          break;
        }
        // Authoritative twin-stage cold-forged bolt-into-battery lug lockup ("ka-chunk")
        const lockBase =
          weaponId === 'p08'
            ? 1680
            : profile.mechanismStyle === 'short_recoil_heavy'
              ? 780
              : profile.mechanismStyle === 'compact_9mm'
                ? 1360
                : 1120;
        // Stage 1: Extractor snap & breech face contact
        this.emitSteelWaveguideStrike({
          startTime: now,
          fundamentalHz: lockBase * 0.84,
          baseDecaySec: 0.048,
          gainPeak: 0.25,
          hardness01: 0.76,
          massBodyHz: 148,
          bus: 'ballistic',
        });
        // Stage 2: Rotary locking lugs / slide hood seating into barrel extension (+11ms)
        this.emitSteelWaveguideStrike({
          startTime: now + (isSlowMo ? 0.018 : 0.011),
          fundamentalHz: lockBase,
          baseDecaySec: 0.064,
          gainPeak: 0.33,
          hardness01: 0.88,
          massBodyHz: 192,
          bus: 'ballistic',
        });
        break;
      }

      case 'sear_reset': {
        // Tactile disconnector-to-primary-sear steel hook engagement click
        this.emitSteelWaveguideStrike({
          startTime: now,
          fundamentalHz: 2460,
          baseDecaySec: 0.028,
          gainPeak: 0.22,
          hardness01: 0.9,
          bus: 'mechanical',
        });
        break;
      }
    }
  }

  /**
   * Procedural Web Audio synthesis for compound bows & helical-cam crossbows:
   * roller/ratchet draw whirr, let-off draw-stop / latch arming, crisp D-loop/sear
   * release snap, composite limb sub-thud, multi-partial braided bowstring twang
   * waveguide decay, and aerodynamic arrow/bolt whoosh.
   */
  private playArcheryFiringEvent(
    kind: FiringSoundEventKind,
    profile: CaliberAcousticProfile,
    now: number,
    isSlowMo: boolean
  ): void {
    const isCrossbow = profile.mechanismStyle === 'compound_crossbow';

    switch (kind) {
      case 'sear_release': {
        // Phase 0 (0..0.24): Draw Stroke & Cable Take-Up / VersaDrive Ratchet Cocking
        if (isCrossbow) {
          const step = isSlowMo ? 0.042 : 0.022;
          for (let i = 0; i < 4; i++) {
            this.emitSteelWaveguideStrike({
              startTime: now + i * step,
              fundamentalHz: 1920 + i * 115,
              baseDecaySec: 0.022,
              gainPeak: 0.14,
              hardness01: 0.84,
              bus: 'mechanical',
            });
          }
          this.emitNoiseBurst({
            startTime: now,
            duration: step * 4,
            filterType: 'bandpass',
            freqStart: 1180,
            freqEnd: 1840,
            q: 3.2,
            gainPeak: 0.11,
            attack: 0.008,
            bus: 'mechanical',
          });
        } else {
          // Roller cable-guard glide & ABEC-7 cam axle bearing draw whirr
          this.emitNoiseBurst({
            startTime: now,
            duration: isSlowMo ? 0.15 : 0.085,
            filterType: 'bandpass',
            freqStart: 820,
            freqEnd: 1520,
            q: 2.8,
            gainPeak: 0.11,
            attack: 0.012,
            bus: 'mechanical',
          });
          this.emitModalPing({
            startTime: now,
            duration: isSlowMo ? 0.14 : 0.08,
            freqStart: 195,
            freqEnd: 285,
            type: 'triangle',
            gainPeak: 0.075,
            bus: 'mechanical',
          });
        }
        break;
      }

      case 'primer_ignition': {
        // Phase 1 (0.24..0.32): Full Draw Valley / Draw-Stop Peg & Latch Arming
        if (isCrossbow) {
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 1680,
            baseDecaySec: 0.028,
            gainPeak: 0.18,
            hardness01: 0.82,
            massBodyHz: 240,
            bus: 'mechanical',
          });
          this.emitSteelWaveguideStrike({
            startTime: now + (isSlowMo ? 0.022 : 0.011),
            fundamentalHz: 2340,
            baseDecaySec: 0.02,
            gainPeak: 0.12,
            hardness01: 0.88,
            bus: 'mechanical',
          });
        } else {
          // Binary cam draw-stop peg contact + drop-away launcher cradle click
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 780,
            baseDecaySec: 0.032,
            gainPeak: 0.14,
            hardness01: 0.52,
            massBodyHz: 165,
            bus: 'mechanical',
          });
          this.emitSteelWaveguideStrike({
            startTime: now + 0.01,
            fundamentalHz: 2140,
            baseDecaySec: 0.022,
            gainPeak: 0.1,
            hardness01: 0.78,
            bus: 'mechanical',
          });
        }
        break;
      }

      case 'gas_or_recoil': {
        // Phase 2 (0.32..0.36): Crisp Release Aid / Trac-Trigger Sear Break
        this.emitSteelWaveguideStrike({
          startTime: now,
          fundamentalHz: isCrossbow ? 2480 : 2260,
          baseDecaySec: 0.03,
          gainPeak: 0.28,
          hardness01: 0.9,
          massBodyHz: isCrossbow ? 320 : 270,
          bus: 'mechanical',
        });
        break;
      }

      case 'cam_unlock': {
        // Phase 3 (0.36..0.50): Power Stroke -> Limb Thud + Bowstring Twang Waveguide + Arrow Whoosh
        // 1. Composite split-limb & riser harmonic sub-thud
        this.emitModalPing({
          startTime: now,
          duration: profile.punchDecaySec,
          freqStart: profile.subFreqHz * 2.25,
          freqEnd: profile.subFreqHz,
          type: 'sine',
          gainPeak: profile.peakGain * 0.72,
          bus: 'ballistic',
        });

        // 2. Multi-partial braided BCY-X bowstring twang waveguide decay
        const fString = isCrossbow ? 184 : 142;
        const stringDur = profile.blastTailSec * (isSlowMo ? 1.25 : 1.0);
        for (let i = 0; i < BOWSTRING_TWANG_PARTIALS.length; i++) {
          const ratio = BOWSTRING_TWANG_PARTIALS[i];
          this.emitModalPing({
            startTime: now + 0.002,
            duration: stringDur / (1 + i * 0.58),
            freqStart: fString * ratio * 1.045,
            freqEnd: fString * ratio * 0.955,
            type: i === 0 ? 'triangle' : 'sine',
            gainPeak: (profile.peakGain * 0.32) / (1 + i * 0.72),
            bus: 'ballistic',
          });
        }

        // 3. Aerodynamic helical-vane arrow/bolt air-shear whoosh
        this.emitNoiseBurst({
          startTime: now + (isSlowMo ? 0.012 : 0.005),
          duration: isSlowMo ? 0.2 : 0.11,
          filterType: 'bandpass',
          freqStart: isCrossbow ? 1150 : 780,
          freqEnd: isCrossbow ? 3600 : 2400,
          q: 1.75,
          gainPeak: profile.peakGain * 0.66,
          attack: 0.008,
          bus: 'ballistic',
        });
        break;
      }

      case 'extract_eject': {
        // Phase 4 (0.50..0.68): String-Stop Bumper Dampening & Launcher Drop / Flight Wake
        this.emitModalPing({
          startTime: now,
          duration: 0.085,
          freqStart: 132,
          freqEnd: 74,
          type: 'sine',
          gainPeak: 0.22,
          bus: 'mechanical',
        });
        if (isCrossbow) {
          this.emitNoiseBurst({
            startTime: now + 0.004,
            duration: isSlowMo ? 0.14 : 0.08,
            filterType: 'bandpass',
            freqStart: 2700,
            freqEnd: 1250,
            q: 2.2,
            gainPeak: 0.18,
            attack: 0.005,
            bus: 'ballistic',
          });
        } else {
          this.emitSteelWaveguideStrike({
            startTime: now + 0.005,
            fundamentalHz: 1520,
            baseDecaySec: 0.028,
            gainPeak: 0.14,
            hardness01: 0.72,
            bus: 'mechanical',
          });
        }
        break;
      }

      case 'spring_feed': {
        // Phase 5a (0.68..0.82): Harmonic Dampening / VersaDrive Sled Return
        if (isCrossbow) {
          this.emitNoiseBurst({
            startTime: now,
            duration: isSlowMo ? 0.11 : 0.06,
            filterType: 'bandpass',
            freqStart: 1450,
            freqEnd: 2150,
            q: 3.8,
            gainPeak: 0.15,
            attack: 0.006,
            bus: 'mechanical',
          });
        } else {
          this.emitModalPing({
            startTime: now,
            duration: 0.09,
            freqStart: 98,
            freqEnd: 66,
            type: 'sine',
            gainPeak: 0.09,
            bus: 'mechanical',
          });
        }
        break;
      }

      case 'battery_lockup': {
        // Phase 5b: Sled Dock / Re-Nock Rest Seat
        this.emitSteelWaveguideStrike({
          startTime: now,
          fundamentalHz: 1040,
          baseDecaySec: 0.036,
          gainPeak: 0.16,
          hardness01: 0.68,
          massBodyHz: 165,
          bus: 'mechanical',
        });
        break;
      }

      case 'sear_reset': {
        // Phase 6 (0.86..1.00): Brace-Height Equilibrium / Sear Ready Click
        this.emitSteelWaveguideStrike({
          startTime: now,
          fundamentalHz: 2240,
          baseDecaySec: 0.024,
          gainPeak: 0.15,
          hardness01: 0.84,
          bus: 'mechanical',
        });
        break;
      }
    }
  }

  /**
   * Procedural Web Audio synthesis for 1:1 Main Battle Tank main cannons
   * (125mm ZPT-98 carousel autoloader, 120mm M256/Rh-120 bustle manual,
   * and WWII 88mm KwK 36 twin-baffle brake): sub-bass chest-slam shockwaves
   * (24–31 Hz), hydro-pneumatic recoil-buffer cylinder hiss, heavy forged
   * sliding-wedge breech block clang, carousel motor / pneumatic blast-door
   * cycle, and hollow steel stub-base / 88mm brass shell resonance.
   */
  private playTankCannonFiringEvent(
    kind: FiringSoundEventKind,
    weaponId: WeaponId,
    profile: CaliberAcousticProfile,
    now: number,
    isSlowMo: boolean
  ): void {
    const isTiger = weaponId === 'tiger1';
    const isAutoloader = weaponId === 'ztz99a';

    switch (kind) {
      case 'sear_release': {
        if (isTiger) {
          // Tiger I floor firing pedal mechanical solenoid / lever drop
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 980,
            baseDecaySec: 0.048,
            gainPeak: 0.28,
            hardness01: 0.8,
            massBodyHz: 145,
            bus: 'mechanical',
          });
        } else {
          // Modern MBT gunner Cadillac-grip electric solenoid fire-relay snap
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 2450,
            baseDecaySec: 0.022,
            gainPeak: 0.22,
            hardness01: 0.9,
            bus: 'mechanical',
          });
          this.emitModalPing({
            startTime: now + 0.004,
            duration: 0.05,
            freqStart: 420,
            freqEnd: 310,
            type: 'triangle',
            gainPeak: 0.12,
            bus: 'mechanical',
          });
        }
        break;
      }

      case 'primer_ignition': {
        // 1. Electric / mechanical breech primer pulse
        this.emitSteelWaveguideStrike({
          startTime: now,
          fundamentalHz: 1820,
          baseDecaySec: 0.028,
          gainPeak: 0.24,
          hardness01: 0.88,
          bus: 'mechanical',
        });

        const tBlast = now + (isSlowMo ? 0.032 : 0.008);

        // 2. Earth-shaking 24–31 Hz tank main-cannon sub-bass chest shockwave
        this.emitModalPing({
          startTime: tBlast,
          duration: profile.punchDecaySec,
          freqStart: profile.subFreqHz * 3.1,
          freqEnd: profile.subFreqHz,
          type: 'sine',
          gainPeak: profile.peakGain * 0.96,
          bus: 'ballistic',
        });

        // 3. Saturated high-overpressure cannon muzzle crack
        this.emitNoiseBurst({
          startTime: tBlast,
          duration: isSlowMo ? 0.16 : 0.11,
          filterType: 'bandpass',
          freqStart: profile.crackCutoffHz,
          freqEnd: profile.crackCutoffHz * 0.42,
          q: 0.85,
          gainPeak: profile.peakGain * 0.95,
          attack: 0.001,
          saturate: true,
          bus: 'ballistic',
        });

        // 4. Rolling 1.25–1.45s canyon artillery blast tail
        this.emitNoiseBurst({
          startTime: tBlast + 0.006,
          duration: profile.blastTailSec,
          filterType: 'lowpass',
          freqStart: profile.crackCutoffHz * 0.78,
          freqEnd: Math.max(58, profile.subFreqHz * 2.0),
          q: 0.72,
          gainPeak: 0.46 + profile.brakeRoarGain * 0.48,
          attack: 0.005,
          saturate: true,
          bus: 'ballistic',
        });

        // 5. Heavy forged-steel gun cradle / breech ring shock vibration
        this.emitSteelWaveguideStrike({
          startTime: tBlast + 0.002,
          fundamentalHz: isTiger ? 420 : 340,
          baseDecaySec: 0.14,
          gainPeak: 0.36,
          hardness01: 0.68,
          massBodyHz: 78,
          bus: 'ballistic',
        });

        // 6. Tiger I twin-baffle 88mm KwK 36 lateral muzzle-brake overpressure slap
        if (isTiger) {
          this.emitNoiseBurst({
            startTime: tBlast + 0.003,
            duration: 0.13,
            filterType: 'bandpass',
            freqStart: 1520,
            freqEnd: 460,
            q: 1.4,
            gainPeak: 0.62,
            attack: 0.001,
            saturate: true,
            bus: 'ballistic',
          });
        }
        break;
      }

      case 'gas_or_recoil': {
        // High-pressure hydro-pneumatic recoil cylinder hiss + 2-ton cradle recoil thud + bore evacuator purge
        const dur = isSlowMo ? 0.32 : 0.22;
        this.emitNoiseBurst({
          startTime: now,
          duration: dur,
          filterType: 'bandpass',
          freqStart: 880,
          freqEnd: 260,
          q: 1.85,
          gainPeak: 0.28,
          attack: 0.008,
          bus: 'mechanical',
        });
        this.emitSteelWaveguideStrike({
          startTime: now + 0.004,
          fundamentalHz: 240,
          baseDecaySec: 0.13,
          gainPeak: 0.34,
          hardness01: 0.54,
          massBodyHz: 68,
          bus: 'mechanical',
        });
        break;
      }

      case 'cam_unlock': {
        // Heavy vertical/horizontal sliding-wedge breech block dropping open
        this.emitSteelWaveguideStrike({
          startTime: now,
          fundamentalHz: isTiger ? 540 : 440,
          baseDecaySec: 0.095,
          gainPeak: 0.36,
          hardness01: 0.74,
          massBodyHz: 92,
          bus: 'mechanical',
        });
        this.emitSteelWaveguideStrike({
          startTime: now + (isSlowMo ? 0.028 : 0.015),
          fundamentalHz: isTiger ? 720 : 610,
          baseDecaySec: 0.068,
          gainPeak: 0.26,
          hardness01: 0.82,
          bus: 'mechanical',
        });
        break;
      }

      case 'extract_eject': {
        // Metallic stub-base / full 88mm brass shell extraction & hollow bell clatter
        this.emitSteelWaveguideStrike({
          startTime: now,
          fundamentalHz: isAutoloader ? 780 : isTiger ? 920 : 680,
          baseDecaySec: 0.075,
          gainPeak: 0.3,
          hardness01: 0.78,
          massBodyHz: 112,
          bus: 'mechanical',
        });
        const f0 = profile.casingRingHz;
        const ringStart = now + (isSlowMo ? 0.032 : 0.014);
        const ringDur = isTiger ? 0.28 : 0.18;
        for (let i = 0; i < BRASS_CASING_SHELL_PARTIALS.length; i++) {
          const ratio = BRASS_CASING_SHELL_PARTIALS[i];
          this.emitModalPing({
            startTime: ringStart,
            duration: ringDur / (1 + i * 0.42),
            freqStart: f0 * ratio,
            freqEnd: f0 * ratio * 0.99,
            type: 'sine',
            gainPeak: (isTiger ? 0.17 : 0.13) / (1 + i * 0.65),
            bus: 'ballistic',
          });
        }
        if (isAutoloader) {
          // ZTZ-99A rear turret stub-ejector roof hatch snap-open clank
          this.emitSteelWaveguideStrike({
            startTime: now + (isSlowMo ? 0.045 : 0.022),
            fundamentalHz: 1120,
            baseDecaySec: 0.055,
            gainPeak: 0.24,
            hardness01: 0.82,
            massBodyHz: 168,
            bus: 'mechanical',
          });
        }
        break;
      }

      case 'spring_feed': {
        const dur = isSlowMo ? 0.24 : 0.14;
        if (isAutoloader) {
          // ZTZ-99A 22-round AZ carousel electric stepper motor whirr + two-stage chain rammer clatter
          this.emitModalPing({
            startTime: now,
            duration: dur,
            freqStart: 210,
            freqEnd: 330,
            type: 'triangle',
            gainPeak: 0.22,
            bus: 'mechanical',
          });
          this.emitNoiseBurst({
            startTime: now + 0.008,
            duration: dur * 0.9,
            filterType: 'bandpass',
            freqStart: 780,
            freqEnd: 1420,
            q: 4.2,
            gainPeak: 0.2,
            attack: 0.01,
            bus: 'mechanical',
          });
          this.emitSteelWaveguideStrike({
            startTime: now + dur * 0.65,
            fundamentalHz: 680,
            baseDecaySec: 0.064,
            gainPeak: 0.28,
            hardness01: 0.76,
            massBodyHz: 118,
            bus: 'mechanical',
          });
        } else if (!isTiger) {
          // M1A2 / Leopard 2A7 pneumatic armored bustle blast-door hiss + heavy 120mm round slide
          this.emitNoiseBurst({
            startTime: now,
            duration: dur,
            filterType: 'bandpass',
            freqStart: 1380,
            freqEnd: 560,
            q: 2.6,
            gainPeak: 0.22,
            attack: 0.008,
            bus: 'mechanical',
          });
          this.emitSteelWaveguideStrike({
            startTime: now + dur * 0.25,
            fundamentalHz: 460,
            baseDecaySec: 0.072,
            gainPeak: 0.28,
            hardness01: 0.72,
            massBodyHz: 98,
            bus: 'mechanical',
          });
        } else {
          // Tiger I manual loader shoving 16 kg brass 88mm cartridge into Krupp breech tray
          this.emitNoiseBurst({
            startTime: now,
            duration: dur,
            filterType: 'bandpass',
            freqStart: 1120,
            freqEnd: 680,
            q: 3.0,
            gainPeak: 0.18,
            attack: 0.01,
            bus: 'mechanical',
          });
          this.emitSteelWaveguideStrike({
            startTime: now + dur * 0.55,
            fundamentalHz: 840,
            baseDecaySec: 0.058,
            gainPeak: 0.25,
            hardness01: 0.78,
            massBodyHz: 132,
            bus: 'mechanical',
          });
        }
        break;
      }

      case 'battery_lockup': {
        // Thunderous forged-steel sliding-wedge breech block slamming shut into battery
        this.emitSteelWaveguideStrike({
          startTime: now,
          fundamentalHz: isTiger ? 460 : 380,
          baseDecaySec: 0.095,
          gainPeak: 0.36,
          hardness01: 0.78,
          massBodyHz: 86,
          bus: 'ballistic',
        });
        this.emitSteelWaveguideStrike({
          startTime: now + (isSlowMo ? 0.026 : 0.014),
          fundamentalHz: isTiger ? 620 : 520,
          baseDecaySec: 0.11,
          gainPeak: 0.42,
          hardness01: 0.88,
          massBodyHz: 108,
          bus: 'ballistic',
        });
        break;
      }

      case 'sear_reset': {
        if (isTiger) {
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 1320,
            baseDecaySec: 0.036,
            gainPeak: 0.22,
            hardness01: 0.84,
            massBodyHz: 190,
            bus: 'mechanical',
          });
        } else {
          // Modern fire-control computer gun-ready electronic confirmation tone + breech micro-switch
          this.emitSteelWaveguideStrike({
            startTime: now,
            fundamentalHz: 1860,
            baseDecaySec: 0.026,
            gainPeak: 0.18,
            hardness01: 0.86,
            bus: 'mechanical',
          });
          this.emitModalPing({
            startTime: now + 0.008,
            duration: 0.055,
            freqStart: 1680,
            freqEnd: 1680,
            type: 'sine',
            gainPeak: 0.075,
            bus: 'dry_only',
          });
        }
        break;
      }
    }
  }

  /**
   * Synthesizes spent brass cartridge casing hitting the gunsmith bench / range floor
   * with velocity-scaled cylindrical C26000 brass shell modes + rim tip-over micro-clink.
   */
  public playBrassCasingBounce(
    caliber: CaliberProfile,
    impactSpeedCmS: number
  ): void {
    if (
      isArcheryCaliber(caliber) ||
      impactSpeedCmS <= 6 ||
      useAppStore.getState().sfxMuted
    ) {
      return;
    }
    const ctx = this.unlock();
    if (!ctx || ctx.state !== 'running') return;

    const profile =
      CALIBER_ACOUSTIC_PROFILES[caliber] ??
      CALIBER_ACOUSTIC_PROFILES['9mm_para'];
    const vel01 = Math.max(0.06, Math.min(1.0, (impactSpeedCmS - 6) / 240));
    const now = ctx.currentTime + 0.0015;

    // Tiny deterministic pitch micro-variation from arrival timestamp so multiple casings sound distinct
    const jitter = 0.975 + ((now * 17.3) % 1) * 0.05;
    const f0 = profile.casingRingHz * jitter;

    // Floor / mat surface contact tick
    this.emitNoiseBurst({
      startTime: now,
      duration: 0.006,
      filterType: 'highpass',
      freqStart: 2600,
      q: 1.4,
      gainPeak: 0.14 * vel01,
      attack: 0.0005,
      bus: 'ballistic',
    });

    // Cylindrical hollow brass shell modal partials
    const ringDecay =
      caliber === '50_bmg' || caliber === '338_lapua' ? 0.19 : 0.135;
    for (let i = 0; i < BRASS_CASING_SHELL_PARTIALS.length; i++) {
      const ratio = BRASS_CASING_SHELL_PARTIALS[i];
      this.emitModalPing({
        startTime: now,
        duration: ringDecay / (1 + i * 0.52),
        freqStart: f0 * ratio,
        freqEnd: f0 * ratio * 0.992,
        type: 'sine',
        gainPeak: (0.16 * vel01) / (1 + i * 0.68),
        bus: 'ballistic',
      });
    }

    // Secondary rim-rocking double-clink when casing tips flat onto its mouth
    if (impactSpeedCmS < 155) {
      const rockDelay = 0.014 + (1 - vel01) * 0.012;
      this.emitModalPing({
        startTime: now + rockDelay,
        duration: ringDecay * 0.55,
        freqStart: f0 * 1.03,
        freqEnd: f0 * 1.01,
        type: 'sine',
        gainPeak: 0.075 * vel01,
        bus: 'ballistic',
      });
      this.emitModalPing({
        startTime: now + rockDelay,
        duration: ringDecay * 0.38,
        freqStart: f0 * BRASS_CASING_SHELL_PARTIALS[1] * 1.02,
        type: 'sine',
        gainPeak: 0.045 * vel01,
        bus: 'ballistic',
      });
    }
  }

  public playSelectorDetent(mode: 'safe' | 'semi' | 'auto'): void {
    if (useAppStore.getState().sfxMuted) return;
    const ctx = this.unlock();
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime + 0.001;
    const pitchMap = {
      safe: 1460,
      semi: 1840,
      auto: 2040,
    } as const;
    const f0 = pitchMap[mode];

    // Spring-loaded detent plunger sliding into machined receiver pocket
    this.emitSteelWaveguideStrike({
      startTime: now,
      fundamentalHz: f0,
      baseDecaySec: 0.032,
      gainPeak: 0.24,
      hardness01: 0.88,
      massBodyHz: mode === 'safe' ? 220 : 280,
      bus: 'mechanical',
    });

    if (mode === 'auto') {
      // Secondary auto-sear trip lever clearance click
      this.emitSteelWaveguideStrike({
        startTime: now + 0.012,
        fundamentalHz: 2320,
        baseDecaySec: 0.024,
        gainPeak: 0.16,
        hardness01: 0.9,
        bus: 'mechanical',
      });
    }
  }

  public playTriggerDryBlock(): void {
    if (useAppStore.getState().sfxMuted) return;
    const ctx = this.unlock();
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime + 0.001;
    // Dead-stopped muted steel trigger bar hitting safety block cam
    this.emitSteelWaveguideStrike({
      startTime: now,
      fundamentalHz: 2280,
      baseDecaySec: 0.019,
      gainPeak: 0.21,
      hardness01: 0.92,
      massBodyHz: 340,
      bus: 'mechanical',
    });
  }

  public playTriggerReset(): void {
    if (useAppStore.getState().sfxMuted) return;
    const ctx = this.unlock();
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime + 0.001;
    // Tactile disconnector release + crisp primary sear re-engagement snap
    this.emitNoiseBurst({
      startTime: now,
      duration: 0.009,
      filterType: 'bandpass',
      freqStart: 2400,
      freqEnd: 3400,
      q: 4.0,
      gainPeak: 0.12,
      bus: 'mechanical',
    });
    this.emitSteelWaveguideStrike({
      startTime: now + 0.006,
      fundamentalHz: 2640,
      baseDecaySec: 0.028,
      gainPeak: 0.24,
      hardness01: 0.92,
      massBodyHz: 320,
      bus: 'mechanical',
    });
  }

  public playPressCheckSpring(direction: PressCheckDirection): void {
    if (useAppStore.getState().sfxMuted) return;
    const ctx = this.unlock();
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime + 0.001;
    const isPull = direction === 'pull' || direction === 'back';
    if (isTankWeapon(useAppStore.getState().activeWeaponId)) {
      // Heavy forged-steel tank breech inspection clank & hydraulic return
      this.emitSteelWaveguideStrike({
        startTime: now,
        fundamentalHz: isPull ? 460 : 540,
        baseDecaySec: isPull ? 0.075 : 0.095,
        gainPeak: isPull ? 0.28 : 0.36,
        hardness01: isPull ? 0.74 : 0.86,
        massBodyHz: isPull ? 92 : 106,
        bus: isPull ? 'mechanical' : 'ballistic',
      });
      this.emitNoiseBurst({
        startTime: now + 0.004,
        duration: 0.09,
        filterType: 'bandpass',
        freqStart: isPull ? 760 : 1120,
        freqEnd: isPull ? 340 : 480,
        q: 2.2,
        gainPeak: 0.18,
        attack: 0.006,
        bus: 'mechanical',
      });
      return;
    }
    if (isArcheryWeapon(useAppStore.getState().activeWeaponId)) {
      this.emitNoiseBurst({
        startTime: now,
        duration: isPull ? 0.075 : 0.055,
        filterType: 'bandpass',
        freqStart: isPull ? 920 : 1480,
        freqEnd: isPull ? 1560 : 880,
        q: 3.1,
        gainPeak: 0.14,
        attack: 0.006,
        bus: 'mechanical',
      });
      this.emitModalPing({
        startTime: now + (isPull ? 0.01 : 0.02),
        duration: 0.09,
        freqStart: isPull ? 180 : 148,
        freqEnd: isPull ? 210 : 128,
        type: 'triangle',
        gainPeak: 0.12,
        bus: 'mechanical',
      });
      return;
    }

    if (isPull) {
      // Braided recoil spring compression rasp + partial lug cam-out click
      this.emitNoiseBurst({
        startTime: now,
        duration: 0.068,
        filterType: 'bandpass',
        freqStart: 1620,
        freqEnd: 2780,
        q: 4.5,
        gainPeak: 0.18,
        attack: 0.006,
        bus: 'mechanical',
      });
      this.emitSteelWaveguideStrike({
        startTime: now + 0.004,
        fundamentalHz: 1320,
        baseDecaySec: 0.036,
        gainPeak: 0.2,
        hardness01: 0.75,
        massBodyHz: 190,
        bus: 'mechanical',
      });
    } else {
      // Crisp recoil spring return + forward battery lockup clack
      this.emitNoiseBurst({
        startTime: now,
        duration: 0.042,
        filterType: 'bandpass',
        freqStart: 2650,
        freqEnd: 1580,
        q: 4.0,
        gainPeak: 0.16,
        attack: 0.003,
        bus: 'mechanical',
      });
      this.emitSteelWaveguideStrike({
        startTime: now + 0.024,
        fundamentalHz: 1180,
        baseDecaySec: 0.056,
        gainPeak: 0.3,
        hardness01: 0.88,
        massBodyHz: 175,
        bus: 'ballistic',
      });
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
      this.emitSteelWaveguideStrike({
        startTime: now,
        fundamentalHz: 2380,
        baseDecaySec: 0.022,
        gainPeak: 0.13,
        hardness01: 0.78,
        bus: 'dry_only',
      });
    } else if (kind === 'preset_detent') {
      this.emitSteelWaveguideStrike({
        startTime: now,
        fundamentalHz: 1760,
        baseDecaySec: 0.028,
        gainPeak: 0.17,
        hardness01: 0.82,
        massBodyHz: 240,
        bus: 'mechanical',
      });
    } else if (kind === 'director_cue') {
      this.emitModalPing({
        startTime: now,
        duration: 0.032,
        freqStart: 1480,
        freqEnd: 2220,
        type: 'sine',
        gainPeak: 0.08,
        bus: 'dry_only',
      });
    } else {
      this.emitSteelWaveguideStrike({
        startTime: now,
        fundamentalHz: 2050,
        baseDecaySec: 0.02,
        gainPeak: 0.13,
        hardness01: 0.8,
        bus: 'dry_only',
      });
    }
  }
}

const soundEngine = new ProceduralGunsmithSoundEngine();

export function unlockMechanicalAudio(): void {
  soundEngine.unlock();
}

export function setAcousticEnvironment(
  preset: AcousticEnvironmentPreset
): void {
  soundEngine.setEnvironment(preset);
}

export function getAcousticEnvironment(): AcousticEnvironmentPreset {
  return soundEngine.getEnvironment();
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

export function playBrassCasingBounceSound(
  caliber: CaliberProfile,
  impactSpeedCmS: number
): void {
  soundEngine.playBrassCasingBounce(caliber, impactSpeedCmS);
}

export function playSelectorDetentSound(
  mode: 'safe' | 'semi' | 'auto'
): void {
  soundEngine.playSelectorDetent(mode);
}

export function playTriggerDryBlockSound(): void {
  soundEngine.playTriggerDryBlock();
}

export function playTriggerResetSound(): void {
  soundEngine.playTriggerReset();
}

export function playPressCheckSpringSound(
  direction: PressCheckDirection
): void {
  soundEngine.playPressCheckSpring(direction);
}

/**
 * Returns a captureable Web Audio MediaStream synchronized with `masterGain`
 * for `WP-22` Director Reel video exports. Returns null if unavailable.
 */
export function getRecordingAudioStream(): MediaStream | null {
  return soundEngine.getRecordingAudioStream();
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
    let prevFireSpeed = useAppStore.getState().fireSpeedMultiplier;

    const unsubStore = useAppStore.subscribe((state) => {
      if (state.fireSpeedMultiplier !== prevFireSpeed) {
        prevFireSpeed = state.fireSpeedMultiplier;
        soundEngine.syncSpeedWetMix(state.fireSpeedMultiplier);
      }

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
