export type AcousticEnvironmentPreset =
  | 'bench_close'
  | 'indoor_range'
  | 'tactical_hall';

export interface EarlyReflectionTap {
  /** Specular reflection arrival delay in milliseconds */
  delayMs: number;
  /** Left channel linear amplitude (signed for boundary phase inversion) */
  gainL: number;
  /** Right channel linear amplitude */
  gainR: number;
  /** Interaural time difference offset in milliseconds (+ delays R, - delays L) */
  itdMs: number;
  /** Wall surface HF absorption damping factor [0..1] (higher = darker reflection) */
  wallDamping: number;
}

export interface AcousticEnvironmentConfig {
  id: AcousticEnvironmentPreset;
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
  descriptionEn: string;
  /** Impulse response buffer length in seconds */
  durationSec: number;
  /** Low-frequency (< 400 Hz) reverberation decay time T60 in seconds */
  rt60LowSec: number;
  /** High-frequency (> 3 kHz) air & surface absorption T60 in seconds */
  rt60HighSec: number;
  /** Initial air-absorption low-pass cutoff at t = 0 in Hz */
  initialCutoffHz: number;
  /** Terminal air-absorption low-pass cutoff at t = durationSec in Hz */
  finalCutoffHz: number;
  /** Discrete specular early reflection taps (concrete floor, walls, ceiling baffles) */
  earlyReflections: readonly EarlyReflectionTap[];
  /** Late diffuse stochastic tail blend scalar */
  diffuseTailGain: number;
  /** Default ConvolverNode wet send gain at 1.0x live firing speed */
  baseWetMix: number;
  /** Wet send attenuation multiplier during 0.25x close-up slow-mo inspection */
  slowMoWetScale: number;
}

export const ACOUSTIC_ENVIRONMENT_PRESETS: readonly AcousticEnvironmentPreset[] =
  ['bench_close', 'indoor_range', 'tactical_hall'] as const;

/**
 * Core concrete/hardwood room boundary slapback delays (`7ms, 13ms, 21ms, 34ms`)
 * shared as primary early-reflection geometry anchors across armory spaces:
 * -  7 ms (~2.4 m path delta): Gunsmith workbench top / shooting stall partition bounce
 * - 13 ms (~4.5 m path delta): Concrete floor & lateral side-wall first reflection
 * - 21 ms (~7.2 m path delta): Overhead steel/concrete ceiling baffle reflection
 * - 34 ms (~11.7 m path delta): Rear wall / axial corner double-bounce slapback
 */
export const PRIMARY_SLAPBACK_DELAYS_MS = [7, 13, 21, 34] as const;

export const ACOUSTIC_ENVIRONMENT_CONFIGS: Record<
  AcousticEnvironmentPreset,
  AcousticEnvironmentConfig
> = {
  bench_close: {
    id: 'bench_close',
    labelZh: '军械师近场工作台 (0.18s)',
    labelEn: 'Gunsmith Bench Close-Mic (0.18s)',
    descriptionZh:
      '紧凑吸音军械室近场拾音，保留极致干脆的阻铁释放、闭锁突笋咬合与弹簧摩擦瞬态细节。',
    descriptionEn:
      'Tight treated armory room with ultra-crisp transient definition for close FCG & bolt lockup inspection.',
    durationSec: 0.18,
    rt60LowSec: 0.155,
    rt60HighSec: 0.078,
    initialCutoffHz: 12800,
    finalCutoffHz: 2100,
    earlyReflections: [
      { delayMs: 7, gainL: 0.44, gainR: 0.38, itdMs: 0.18, wallDamping: 0.18 },
      {
        delayMs: 13,
        gainL: -0.31,
        gainR: 0.36,
        itdMs: -0.26,
        wallDamping: 0.28,
      },
      { delayMs: 21, gainL: 0.24, gainR: -0.22, itdMs: 0.31, wallDamping: 0.4 },
      {
        delayMs: 34,
        gainL: 0.15,
        gainR: 0.17,
        itdMs: -0.22,
        wallDamping: 0.52,
      },
    ],
    diffuseTailGain: 0.22,
    baseWetMix: 0.18,
    slowMoWetScale: 0.32,
  },

  indoor_range: {
    id: 'indoor_range',
    labelZh: '25米混凝土地下靶道 (0.65s)',
    labelEn: '25m Concrete Indoor Range (0.65s)',
    descriptionZh:
      '平行钢筋混凝土靶道与顶棚防跳弹挡板，呈现凌厉的超音速激波拍墙回声与清脆抛壳落地声。',
    descriptionEn:
      'Concrete 25m firing lane with overhead steel baffles and fierce supersonic slapback reflections.',
    durationSec: 0.65,
    rt60LowSec: 0.58,
    rt60HighSec: 0.24,
    initialCutoffHz: 11200,
    finalCutoffHz: 1150,
    earlyReflections: [
      { delayMs: 7, gainL: 0.52, gainR: 0.46, itdMs: 0.21, wallDamping: 0.14 },
      {
        delayMs: 13,
        gainL: -0.48,
        gainR: 0.54,
        itdMs: -0.34,
        wallDamping: 0.2,
      },
      {
        delayMs: 21,
        gainL: 0.41,
        gainR: -0.37,
        itdMs: 0.29,
        wallDamping: 0.26,
      },
      {
        delayMs: 34,
        gainL: -0.35,
        gainR: -0.39,
        itdMs: -0.38,
        wallDamping: 0.34,
      },
      // 25m lane downrange baffle & backstop flutter slapbacks
      { delayMs: 54, gainL: 0.26, gainR: 0.22, itdMs: 0.42, wallDamping: 0.46 },
      {
        delayMs: 82,
        gainL: -0.19,
        gainR: 0.21,
        itdMs: -0.36,
        wallDamping: 0.58,
      },
      {
        delayMs: 118,
        gainL: 0.13,
        gainR: -0.14,
        itdMs: 0.3,
        wallDamping: 0.68,
      },
    ],
    diffuseTailGain: 0.36,
    baseWetMix: 0.34,
    slowMoWetScale: 0.28,
  },

  tactical_hall: {
    id: 'tactical_hall',
    labelZh: '深层战术穹顶靶场 (1.35s)',
    labelEn: 'Cavernous Tactical Vault (1.35s)',
    descriptionZh:
      '巨型地下混凝土穹顶与峡谷式纵深混响，释放 .50 BMG 与 .338 马格南震撼胸腔的低频滚雷余韵。',
    descriptionEn:
      'Deep cavernous concrete vault and canyon tail engineered for .50 BMG & .338 Lapua chest-thumping echo.',
    durationSec: 1.35,
    rt60LowSec: 1.28,
    rt60HighSec: 0.46,
    initialCutoffHz: 9800,
    finalCutoffHz: 680,
    earlyReflections: [
      { delayMs: 7, gainL: 0.46, gainR: 0.41, itdMs: 0.22, wallDamping: 0.16 },
      {
        delayMs: 13,
        gainL: -0.44,
        gainR: 0.49,
        itdMs: -0.36,
        wallDamping: 0.22,
      },
      {
        delayMs: 21,
        gainL: 0.38,
        gainR: -0.35,
        itdMs: 0.33,
        wallDamping: 0.28,
      },
      {
        delayMs: 34,
        gainL: 0.34,
        gainR: 0.37,
        itdMs: -0.41,
        wallDamping: 0.35,
      },
      // Vault column & deep canyon wall returns
      {
        delayMs: 61,
        gainL: -0.29,
        gainR: 0.26,
        itdMs: 0.48,
        wallDamping: 0.45,
      },
      {
        delayMs: 98,
        gainL: 0.24,
        gainR: -0.27,
        itdMs: -0.52,
        wallDamping: 0.56,
      },
      {
        delayMs: 152,
        gainL: 0.18,
        gainR: 0.16,
        itdMs: 0.44,
        wallDamping: 0.68,
      },
      {
        delayMs: 218,
        gainL: -0.13,
        gainR: 0.14,
        itdMs: -0.39,
        wallDamping: 0.76,
      },
    ],
    diffuseTailGain: 0.44,
    baseWetMix: 0.46,
    slowMoWetScale: 0.26,
  },
};

export interface GeneratedImpulseResponseData {
  preset: AcousticEnvironmentPreset;
  sampleRate: number;
  durationSec: number;
  length: number;
  left: Float32Array;
  right: Float32Array;
  rmsLeft: number;
  rmsRight: number;
  peakAbs: number;
}

const LN_1000 = 6.907755278982137; // ln(10^3) for -60 dB RT60 decay

function createXorshift32(seedInit: number): () => number {
  let s = seedInit >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0xffffffff) * 2 - 1;
  };
}

function injectSpecularReflectionKernel(
  channel: Float32Array,
  sampleRate: number,
  arrivalSec: number,
  amplitude: number,
  wallDamping: number
): void {
  const startIdx = Math.round(arrivalSec * sampleRate);
  if (startIdx < 0 || startIdx >= channel.length) return;

  // Short (~0.9ms) exponentially damped boundary reflection kernel with subtle concrete micro-scatter
  const kernelLen = Math.max(4, Math.round(sampleRate * 0.0009));
  const tauSamples = Math.max(
    1.5,
    kernelLen * (0.22 + (1 - wallDamping) * 0.35)
  );
  let lpState = 0;
  const smoothAlpha = Math.max(0.18, Math.min(0.95, 1 - wallDamping * 0.72));

  for (let k = 0; k < kernelLen; k++) {
    const idx = startIdx + k;
    if (idx >= channel.length) break;
    const raw =
      k === 0
        ? 1.0
        : k === 1
          ? -0.28 * wallDamping
          : Math.exp(-k / tauSamples) * (k % 2 === 0 ? 0.24 : -0.18);
    lpState += smoothAlpha * (raw - lpState);
    channel[idx] += amplitude * lpState;
  }
}

function synthesizeChannelTail(
  out: Float32Array,
  cfg: AcousticEnvironmentConfig,
  sampleRate: number,
  seed: number
): void {
  const rand = createXorshift32(seed);
  const dt = 1 / sampleRate;
  const twoPiDt = 2 * Math.PI * dt;

  // 42 Hz DC / sub-rumble high-pass blocker state
  const hpRc = 1 / (2 * Math.PI * 42);
  const hpAlpha = hpRc / (hpRc + dt);
  let prevRaw = 0;
  let hpOut = 0;

  // Time-varying progressive air-absorption one-pole low-pass state
  let airLp = 0;

  for (let i = 0; i < out.length; i++) {
    const t = i * dt;
    const progress = t / cfg.durationSec;

    // Diffuse field builds up smoothly over first 6.5ms behind the direct dry wave
    const onset = 1 - Math.exp(-t / 0.0065);

    // Dual-band RT60 decay: high frequencies decay much faster in air & porous concrete
    const envLow = Math.exp((-LN_1000 * t) / cfg.rt60LowSec);
    const envHigh = Math.exp((-LN_1000 * t) / cfg.rt60HighSec);

    // Sweep air-absorption cutoff exponentially from initialCutoffHz -> finalCutoffHz
    const cutoffHz =
      cfg.initialCutoffHz *
      Math.pow(cfg.finalCutoffHz / cfg.initialCutoffHz, Math.min(1, progress));
    const lpAlpha = Math.min(1, (twoPiDt * cutoffHz) / (1 + twoPiDt * cutoffHz));

    const white = rand();
    airLp += lpAlpha * (white - airLp);
    const hfResidual = white - airLp;

    const shaped =
      (airLp * envLow * 0.78 + hfResidual * envHigh * 0.52) *
      onset *
      cfg.diffuseTailGain;

    // Apply 42 Hz high-pass filter so ConvolverNode never accumulates DC offset
    const combined = out[i] + shaped;
    hpOut = hpAlpha * (hpOut + combined - prevRaw);
    prevRaw = combined;

    // Smooth 6ms cosine fade-out at buffer end to prevent truncation click
    const remSec = cfg.durationSec - t;
    const tailFade =
      remSec < 0.006
        ? 0.5 * (1 - Math.cos(Math.PI * Math.max(0, remSec / 0.006)))
        : 1.0;

    out[i] = hpOut * tailFade;
  }
}

/**
 * Pure, deterministic stereo Room Impulse Response synthesizer.
 * Headless-safe (zero dependency on browser `AudioContext`) for unit testing and caching.
 */
export function generateImpulseResponseSamples(
  preset: AcousticEnvironmentPreset,
  sampleRate = 48000
): GeneratedImpulseResponseData {
  const safeRate = Math.max(8000, Math.min(192000, Math.floor(sampleRate)));
  const cfg = ACOUSTIC_ENVIRONMENT_CONFIGS[preset];
  const length = Math.max(64, Math.round(cfg.durationSec * safeRate));

  const left = new Float32Array(length);
  const right = new Float32Array(length);

  // 1. Stamp discrete concrete floor, wall & baffle specular early reflections
  for (let i = 0; i < cfg.earlyReflections.length; i++) {
    const tap = cfg.earlyReflections[i];
    const baseSec = tap.delayMs * 0.001;
    const halfItdSec = tap.itdMs * 0.0005;
    injectSpecularReflectionKernel(
      left,
      safeRate,
      Math.max(0.001, baseSec - halfItdSec),
      tap.gainL,
      tap.wallDamping
    );
    injectSpecularReflectionKernel(
      right,
      safeRate,
      Math.max(0.001, baseSec + halfItdSec),
      tap.gainR,
      tap.wallDamping
    );
  }

  // 2. Layer binaurally decorrelated diffuse reverberant field with HF air absorption
  const presetSalt =
    preset === 'bench_close'
      ? 0x1a2b3c4d
      : preset === 'indoor_range'
        ? 0x5e6f7788
        : 0x91a2b3c4;
  synthesizeChannelTail(left, cfg, safeRate, (0x6d2b79f5 ^ presetSalt) >>> 0);
  synthesizeChannelTail(right, cfg, safeRate, (0x27d4eb2f ^ presetSalt) >>> 0);

  // 3. Normalize peak headroom to 0.92 while computing stereo RMS diagnostics
  let peakAbs = 0;
  for (let i = 0; i < length; i++) {
    const al = Math.abs(left[i]);
    const ar = Math.abs(right[i]);
    if (al > peakAbs) peakAbs = al;
    if (ar > peakAbs) peakAbs = ar;
  }

  const normGain = peakAbs > 1e-6 ? 0.92 / peakAbs : 1.0;
  let sumSqL = 0;
  let sumSqR = 0;
  let finalPeak = 0;

  for (let i = 0; i < length; i++) {
    const vl = left[i] * normGain;
    const vr = right[i] * normGain;
    left[i] = vl;
    right[i] = vr;
    sumSqL += vl * vl;
    sumSqR += vr * vr;
    const m = Math.max(Math.abs(vl), Math.abs(vr));
    if (m > finalPeak) finalPeak = m;
  }

  return {
    preset,
    sampleRate: safeRate,
    durationSec: cfg.durationSec,
    length,
    left,
    right,
    rmsLeft: Math.sqrt(sumSqL / length),
    rmsRight: Math.sqrt(sumSqR / length),
    peakAbs: finalPeak,
  };
}

/**
 * Computes dynamic ConvolverNode wet return gain, automatically scaling down room
 * reverberation during `0.25x` slow-motion close-up FCG inspection and opening up
 * full acoustic space during `1.0x` live fire.
 */
export function computeDynamicWetSendGain(
  preset: AcousticEnvironmentPreset,
  speedMultiplier: 0.25 | 0.5 | 1.0
): number {
  const cfg = ACOUSTIC_ENVIRONMENT_CONFIGS[preset];
  if (speedMultiplier <= 0.25) {
    return cfg.baseWetMix * cfg.slowMoWetScale;
  }
  if (speedMultiplier <= 0.5) {
    return cfg.baseWetMix * (0.58 + 0.42 * cfg.slowMoWetScale);
  }
  return cfg.baseWetMix;
}

const contextImpulseCache = new WeakMap<
  BaseAudioContext,
  Partial<Record<AcousticEnvironmentPreset, AudioBuffer>>
>();

/**
 * Returns a cached 2-channel stereo `AudioBuffer` for `ConvolverNode` on the given `AudioContext`.
 */
export function getOrCreateAcousticImpulseBuffer(
  ctx: BaseAudioContext,
  preset: AcousticEnvironmentPreset
): AudioBuffer {
  let perCtx = contextImpulseCache.get(ctx);
  if (!perCtx) {
    perCtx = {};
    contextImpulseCache.set(ctx, perCtx);
  }

  const cached = perCtx[preset];
  if (cached) {
    return cached;
  }

  const synthesized = generateImpulseResponseSamples(preset, ctx.sampleRate);
  const audioBuffer = ctx.createBuffer(
    2,
    synthesized.length,
    synthesized.sampleRate
  );
  audioBuffer.getChannelData(0).set(synthesized.left);
  audioBuffer.getChannelData(1).set(synthesized.right);
  perCtx[preset] = audioBuffer;
  return audioBuffer;
}

export function isAcousticEnvironmentPreset(
  val: string | null | undefined
): val is AcousticEnvironmentPreset {
  return (
    val === 'bench_close' || val === 'indoor_range' || val === 'tactical_hall'
  );
}
