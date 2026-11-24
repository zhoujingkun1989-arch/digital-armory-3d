// ============================================================================
// Track B2 · Procedural Web Audio Synthesizer for 3D Firing Range
//
// Synthesizes crisp AR500 steel gong metallic "PING!", ballistic gel impact
// thump, dirt berm miss thud, and muzzle launch report with zero external audio
// files and complete SSR/mute safety.
// ============================================================================

let sharedCtx: AudioContext | null = null;
let sharedNoiseBuffer: AudioBuffer | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    if (!sharedCtx) {
      sharedCtx = new Ctor();
    }
    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume().catch(() => {});
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (sharedNoiseBuffer && sharedNoiseBuffer.sampleRate === ctx.sampleRate) {
    return sharedNoiseBuffer;
  }
  const len = Math.floor(ctx.sampleRate * 0.45);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Deterministic PRNG noise so synthesis is consistent
  let seed = 0x51a7c3d1;
  for (let i = 0; i < len; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  sharedNoiseBuffer = buf;
  return buf;
}

/**
 * Plays a subtle muzzle launch report (supersonic crack, bowstring twang, or
 * deep tank cannon thump) right when the user clicks FIRE.
 */
export function playRangeMuzzleLaunch(
  energyJ: number,
  isArchery: boolean,
  isArmor: boolean,
  muted: boolean
): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(isArchery ? 0.14 : isArmor ? 0.28 : 0.2, now);
  master.connect(ctx.destination);

  if (isArchery) {
    // Crisp bowstring snap + carbon shaft whoosh
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(195, now);
    osc.frequency.exponentialRampToValueAtTime(72, now + 0.14);
    g.gain.setValueAtTime(0.65, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.17);
    return;
  }

  // Low chest punch oscillator
  const punch = ctx.createOscillator();
  const punchGain = ctx.createGain();
  const baseHz = isArmor ? 42 : energyJ > 4000 ? 64 : 96;
  const decayS = isArmor ? 0.38 : energyJ > 4000 ? 0.22 : 0.14;
  punch.type = 'sine';
  punch.frequency.setValueAtTime(baseHz * 2.1, now);
  punch.frequency.exponentialRampToValueAtTime(baseHz * 0.55, now + decayS);
  punchGain.gain.setValueAtTime(0.8, now);
  punchGain.gain.exponentialRampToValueAtTime(0.001, now + decayS);
  punch.connect(punchGain);
  punchGain.connect(master);
  punch.start(now);
  punch.stop(now + decayS + 0.02);

  // Filtered supersonic muzzle blast noise
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(isArmor ? 420 : 1450, now);
  filter.Q.setValueAtTime(0.9, now);
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.65, now);
  nGain.gain.exponentialRampToValueAtTime(0.001, now + decayS * 1.15);
  noise.connect(filter);
  filter.connect(nGain);
  nGain.connect(master);
  noise.start(now);
  noise.stop(now + decayS * 1.2 + 0.02);
}

/**
 * Synthesizes an authentic circular AR500 steel gong "PING!" using inharmonic
 * circular-plate Bessel vibrational modes plus metallic strike transient.
 */
export function playSteelTargetPing(
  energyJ: number,
  isArmor: boolean,
  muted: boolean
): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const energyScale = Math.min(
    1.15,
    Math.max(0.45, Math.log10(Math.max(20, energyJ)) / 4.2)
  );
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.24 * energyScale, now);
  master.connect(ctx.destination);

  // Sharp metallic jacket splash transient
  const splash = ctx.createBufferSource();
  splash.buffer = getNoiseBuffer(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(isArmor ? 1100 : 2600, now);
  const splashGain = ctx.createGain();
  splashGain.gain.setValueAtTime(0.55, now);
  splashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
  splash.connect(hp);
  hp.connect(splashGain);
  splashGain.connect(master);
  splash.start(now);
  splash.stop(now + 0.04);

  // Circular steel plate modal frequencies (inharmonic ratios: 1, 1.59, 2.14, 2.92)
  const f0 = isArmor ? 328 : 886;
  const modes: readonly [ratio: number, gain: number, decay: number][] = [
    [1.0, 0.55, isArmor ? 1.65 : 1.18],
    [1.593, 0.36, isArmor ? 1.25 : 0.88],
    [2.136, 0.22, isArmor ? 0.85 : 0.62],
    [2.918, 0.14, isArmor ? 0.52 : 0.38],
  ];

  for (const [ratio, modeAmp, decayS] of modes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = ratio === 1.0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(f0 * ratio, now);
    // Subtle slight downward pitch bend right after elastic shock
    osc.frequency.exponentialRampToValueAtTime(f0 * ratio * 0.992, now + 0.09);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(modeAmp, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0008, now + decayS);

    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + decayS + 0.03);
  }
}

/**
 * Synthesizes a dampened hydrodynamic cavitation thump when striking ballistic gel.
 */
export function playBallisticGelThump(energyJ: number, muted: boolean): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(
    Math.min(0.26, 0.12 + Math.log10(Math.max(10, energyJ)) * 0.03),
    now
  );
  master.connect(ctx.destination);

  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(148, now);
  osc.frequency.exponentialRampToValueAtTime(38, now + 0.14);
  g.gain.setValueAtTime(0.9, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + 0.18);
}

/**
 * Synthesizes a soft muffled earthen berm thud on target miss.
 */
export function playDirtBermMiss(muted: boolean): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(280, now);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.16, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  noise.connect(lp);
  lp.connect(g);
  g.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.16);
}
