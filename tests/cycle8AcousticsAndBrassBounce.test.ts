import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BESPOKE_WEAPON_ACOUSTIC_SIGNATURES,
  BRASS_BOUNCE_MAX_PER_WINDOW,
  BRASS_BOUNCE_MIN_INTERVAL_MS,
  CALIBER_ACOUSTIC_PROFILES,
  computeBrassBounceDamping,
  type FiringSoundEventKind,
  GAU8_HYDRAULIC_BRRRT_PARTIALS_HZ,
  getWeaponBespokeAcousticSignature,
  hasMasterSoftCeilingLimiter,
  MASTER_SOFT_LIMITER_CONFIG,
  MG42_ROLLER_SNAP_PARTIALS_HZ,
  MP5_HK_SLAP_PARTIALS_HZ,
  playBrassCasingBounceSound,
  playPressCheckSpringSound,
  playWeaponFiringEventSound,
  resetMechanicalSoundEngine,
  resolveWeaponMechanismAcousticStyle,
  THOMPSON_BLISH_DRUM_PARTIALS_HZ,
  unlockMechanicalAudio,
} from '../src/engine/audio/mechanicalSoundEngine';
import {
  applyArmoryShot,
  BRASS_AUDIBLE_IMPACT_CMS,
  createArmoryPhysicsInput,
  getArmoryPhysicsState,
  getSpentCasingPool,
  getWeaponRecoilAttenuation,
  resetArmoryPhysics,
  seedArmoryPhysicsRng,
  setBrassFloorImpactListener,
  setCasingBounceListener,
  stepArmoryPhysics,
  WEAPON_FIRING_TIMING,
} from '../src/engine/physics/armoryPhysics';
import { useAppStore } from '../src/store/useAppStore';
import { getWeaponManifest } from '../src/weapons/manifests';
import type { CaliberProfile, WeaponId } from '../src/weapons/types';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;

const ALL_FIRING_CUES: readonly FiringSoundEventKind[] = [
  'sear_release',
  'primer_ignition',
  'gas_or_recoil',
  'cam_unlock',
  'extract_eject',
  'spring_feed',
  'battery_lockup',
  'sear_reset',
];

interface RecordedAudioGraph {
  oscFreqs: number[];
  filterFreqs: number[];
  limiterConfigs: {
    threshold: number;
    knee: number;
    ratio: number;
    attack: number;
    release: number;
  }[];
  connections: [string, string][];
}

function createMockAudioContextClass(
  log: RecordedAudioGraph,
  opts: { withDynamicsCompressor?: boolean } = {}
) {
  const withCompressor = opts.withDynamicsCompressor ?? true;
  const makeParam = (bucket?: number[]) => ({
    value: 0,
    setValueAtTime: (v: number) => {
      bucket?.push(v);
    },
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: (v: number) => {
      bucket?.push(v);
    },
    setTargetAtTime: () => {},
  });

  const makeNode = (tag: string) => ({
    _tag: tag,
    connect: (target: { _tag?: string }) => {
      log.connections.push([tag, target?._tag ?? 'unknown']);
    },
    disconnect: () => {},
  });

  class MockAudioContext {
    public state = 'running';
    public sampleRate = 44100;
    public currentTime = 1.0;
    public destination = { _tag: 'destination' };

    public resume() {
      return Promise.resolve();
    }

    public createGain() {
      return { ...makeNode('gain'), gain: makeParam() };
    }

    public createConvolver() {
      return { ...makeNode('convolver'), normalize: false, buffer: null };
    }

    public createBuffer(channels: number, length: number, sampleRate: number) {
      const ch = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        duration: length / sampleRate,
        length,
        numberOfChannels: channels,
        sampleRate,
        getChannelData: (idx: number) => ch[idx],
      };
    }

    public createBufferSource() {
      return {
        ...makeNode('bufferSource'),
        buffer: null,
        start: () => {},
        stop: () => {},
      };
    }

    public createBiquadFilter() {
      return {
        ...makeNode('filter'),
        type: 'bandpass',
        Q: makeParam(),
        frequency: makeParam(log.filterFreqs),
      };
    }

    public createWaveShaper() {
      return { ...makeNode('waveShaper'), curve: null };
    }

    public createOscillator() {
      return {
        ...makeNode('osc'),
        type: 'sine',
        frequency: makeParam(log.oscFreqs),
        start: () => {},
        stop: () => {},
      };
    }
  }

  if (withCompressor) {
    (
      MockAudioContext.prototype as unknown as Record<string, unknown>
    ).createDynamicsCompressor = function createDynamicsCompressor() {
      const threshold = { value: 0 };
      const knee = { value: 0 };
      const ratio = { value: 0 };
      const attack = { value: 0 };
      const release = { value: 0 };
      const node = {
        ...makeNode('limiter'),
        threshold,
        knee,
        ratio,
        attack,
        release,
      };
      // Capture configured values lazily via getter snapshot on connect
      const origConnect = node.connect;
      node.connect = (target: { _tag?: string }) => {
        log.limiterConfigs.push({
          threshold: threshold.value,
          knee: knee.value,
          ratio: ratio.value,
          attack: attack.value,
          release: release.value,
        });
        origConnect(target);
      };
      return node;
    };
  }

  return MockAudioContext;
}

function makePhysicsInputFor(weaponId: WeaponId) {
  const input = createArmoryPhysicsInput();
  const manifest = getWeaponManifest(weaponId);
  input.weaponId = weaponId;
  input.caliber = manifest.caliberProfile;
  input.firing = true;
  input.floorY = -20;
  input.ejectPortX = 0;
  input.ejectPortY = 4;
  input.ejectPortZ = 2;
  return input;
}

describe('Cycle 8B: Bespoke Acoustics (MG 42 / Thompson / MP5 / GAU-8/A), Brass Floor-Bounce, Soft Limiter & V6 Recoil Parity', () => {
  const prevWindow = (globalThis as Record<string, unknown>).window;

  beforeEach(() => {
    resetMechanicalSoundEngine();
    resetArmoryPhysics();
    seedArmoryPhysicsRng(2026);
    setBrassFloorImpactListener(null);
    setCasingBounceListener(null);
    useAppStore.setState({ sfxMuted: false, activeWeaponId: 'ak15' });
  });

  afterEach(() => {
    resetMechanicalSoundEngine();
    setBrassFloorImpactListener(null);
    setCasingBounceListener(null);
    (globalThis as Record<string, unknown>).window = prevWindow;
  });

  it('1. Registers all 6 bespoke signatures & resolves distinct mechanical styles for MG 42, Thompson, MP5, GAU-8/A, M1911 & K98k', () => {
    // Style separation across shared calibers / categories
    expect(resolveWeaponMechanismAcousticStyle('mg42')).toBe(
      'mg42_roller_buzzsaw'
    );
    expect(resolveWeaponMechanismAcousticStyle('thompson')).toBe(
      'thompson_blish_drum'
    );
    expect(resolveWeaponMechanismAcousticStyle('mp5')).toBe('hk_roller_delayed');
    expect(resolveWeaponMechanismAcousticStyle('gau8')).toBe(
      'hydraulic_rotary_cannon'
    );
    expect(resolveWeaponMechanismAcousticStyle('m1911')).toBe(
      'browning_single_link'
    );
    expect(resolveWeaponMechanismAcousticStyle('k98k')).toBe('mauser_crf_bolt');

    expect(resolveWeaponMechanismAcousticStyle('thompson')).not.toBe(
      resolveWeaponMechanismAcousticStyle('vector')
    );
    expect(resolveWeaponMechanismAcousticStyle('mp5')).not.toBe(
      resolveWeaponMechanismAcousticStyle('g17')
    );
    expect(resolveWeaponMechanismAcousticStyle('mg42')).not.toBe(
      resolveWeaponMechanismAcousticStyle('m249')
    );
    expect(resolveWeaponMechanismAcousticStyle('gau8')).not.toBe(
      resolveWeaponMechanismAcousticStyle('m134')
    );

    const bespokeIds: WeaponId[] = [
      'm1911',
      'k98k',
      'mg42',
      'thompson',
      'mp5',
      'gau8',
    ];
    for (const id of bespokeIds) {
      const sig = getWeaponBespokeAcousticSignature(id);
      expect(sig).not.toBeNull();
      expect(BESPOKE_WEAPON_ACOUSTIC_SIGNATURES[id]).toBe(sig);
      expect(CJK_RE.test(sig!.labelEn)).toBe(false);
      expect(sig!.labelZh.length).toBeGreaterThan(8);
      expect(sig!.customizedEvents).toEqual(ALL_FIRING_CUES);
      expect(sig!.modalPartialsHz.length).toBeGreaterThanOrEqual(3);
    }

    // Verify deterministic Web Audio synthesis across all 8 phases + press-check for the 4 new signatures
    const log: RecordedAudioGraph = {
      oscFreqs: [],
      filterFreqs: [],
      limiterConfigs: [],
      connections: [],
    };
    (globalThis as Record<string, unknown>).window = {
      AudioContext: createMockAudioContextClass(log, {
        withDynamicsCompressor: true,
      }),
    };

    // MG 42
    for (const kind of ALL_FIRING_CUES) {
      playWeaponFiringEventSound(kind, 'mg42', 0.25);
    }
    useAppStore.setState({ activeWeaponId: 'mg42' });
    playPressCheckSpringSound('pull');
    playPressCheckSpringSound('release');
    for (const f of MG42_ROLLER_SNAP_PARTIALS_HZ) {
      expect(log.oscFreqs.some((v) => Math.abs(v - f) < 35)).toBe(true);
    }
    expect(log.oscFreqs.some((v) => Math.abs(v - 42) < 2)).toBe(true);

    // Thompson M1928A1 — must emit Blish/L-drum partials and NEVER fall into KRISS Vector 126 Hz plunge!
    log.oscFreqs.length = 0;
    for (const kind of ALL_FIRING_CUES) {
      playWeaponFiringEventSound(kind, 'thompson', 0.25);
    }
    useAppStore.setState({ activeWeaponId: 'thompson' });
    playPressCheckSpringSound('pull');
    playPressCheckSpringSound('release');
    for (const f of THOMPSON_BLISH_DRUM_PARTIALS_HZ) {
      expect(log.oscFreqs.some((v) => Math.abs(v - f) < 35)).toBe(true);
    }
    expect(log.oscFreqs.some((v) => Math.abs(v - 126) < 2)).toBe(false);

    // H&K MP5A3 — roller-delayed lockup & iconic "HK Slap" harmonics
    log.oscFreqs.length = 0;
    for (const kind of ALL_FIRING_CUES) {
      playWeaponFiringEventSound(kind, 'mp5', 0.25);
    }
    useAppStore.setState({ activeWeaponId: 'mp5' });
    playPressCheckSpringSound('pull');
    playPressCheckSpringSound('release');
    for (const f of MP5_HK_SLAP_PARTIALS_HZ) {
      expect(log.oscFreqs.some((v) => Math.abs(v - f) < 35)).toBe(true);
    }

    // GE GAU-8/A Avenger — 65 Hz / 130 Hz BRRRT! + 820 Hz hydraulic spool + 2480 Hz rotary cam/conveyor
    log.oscFreqs.length = 0;
    for (const kind of ALL_FIRING_CUES) {
      playWeaponFiringEventSound(kind, 'gau8', 0.25);
    }
    useAppStore.setState({ activeWeaponId: 'gau8' });
    playPressCheckSpringSound('pull');
    playPressCheckSpringSound('release');
    for (const f of GAU8_HYDRAULIC_BRRRT_PARTIALS_HZ) {
      expect(log.oscFreqs.some((v) => Math.abs(v - f) < 35)).toBe(true);
    }
  });

  it('2. Zero-GC spent-brass floor-bounce hook fires ONLY on bounce 1 & 2, skips g11/gau8/lift33/r500/python, and throttles rapid fire', () => {
    const events: { cal: CaliberProfile; speed: number; bounce: 1 | 2 }[] = [];
    setCasingBounceListener((cal, speed, bounce) => {
      events.push({ cal, speed, bounce });
    });

    // Brass-ejecting weapon (MG 42 7.92×57mm) fires bounce 1 and bounce 2 cleanly
    const mgInput = makePhysicsInputFor('mg42');
    const tMg = WEAPON_FIRING_TIMING.mg42;
    mgInput.fireProgress = tMg.ejectF - 0.005;
    stepArmoryPhysics(1 / 60, mgInput);
    mgInput.fireProgress = tMg.ejectF + 0.002;
    stepArmoryPhysics(1 / 60, mgInput);
    for (let i = 0; i < 240; i++) {
      stepArmoryPhysics(1 / 60, mgInput);
    }

    expect(events.length).toBe(2);
    expect(events[0].cal).toBe('792_mauser');
    expect(events[0].bounce).toBe(1);
    expect(events[1].bounce).toBe(2);
    expect(events[0].speed).toBeGreaterThan(BRASS_AUDIBLE_IMPACT_CMS);
    expect(events[1].speed).toBeLessThan(events[0].speed);

    // Non-ejecting / caseless / linkless / archery platforms stay 100% silent & spawn 0 floor casings
    const silentWeapons: WeaponId[] = ['g11', 'gau8', 'lift33', 'r500', 'python'];
    for (const id of silentWeapons) {
      events.length = 0;
      resetArmoryPhysics();
      const inp = makePhysicsInputFor(id);
      const timing = WEAPON_FIRING_TIMING[id];
      inp.fireProgress = timing.ejectF - 0.005;
      stepArmoryPhysics(1 / 60, inp);
      inp.fireProgress = timing.ejectF + 0.002;
      stepArmoryPhysics(1 / 60, inp);
      for (let i = 0; i < 180; i++) {
        stepArmoryPhysics(1 / 60, inp);
      }
      expect(
        getSpentCasingPool().some((c) => c.active),
        `${id} should not spawn free floor casings`
      ).toBe(false);
      expect(
        events.length,
        `${id} should emit 0 floor-bounce events`
      ).toBe(0);
    }

    // Damping helper strictly reduces gain & decay on bounce 2
    const d1 = computeBrassBounceDamping(160, 1);
    const d2 = computeBrassBounceDamping(160, 2);
    expect(d2.gainScale).toBeLessThan(d1.gainScale);
    expect(d2.decayScale).toBeLessThan(d1.decayScale);
    expect(d2.pitchScale).toBeGreaterThan(d1.pitchScale);

    // Rate-limited Web Audio brass-bounce synthesizer + caliber guards
    const log: RecordedAudioGraph = {
      oscFreqs: [],
      filterFreqs: [],
      limiterConfigs: [],
      connections: [],
    };
    (globalThis as Record<string, unknown>).window = {
      AudioContext: createMockAudioContextClass(log, {
        withDynamicsCompressor: true,
      }),
    };

    // Skips caseless / linkless / archery cleanly
    expect(playBrassCasingBounceSound('473_caseless', 150, 1, 1000)).toBe(false);
    expect(playBrassCasingBounceSound('30x173_gau8', 150, 1, 1050)).toBe(false);
    expect(playBrassCasingBounceSound('arrow_400gr', 150, 1, 1100)).toBe(false);

    // Rapid burst of 20 impacts spaced 10ms apart (100/s) throttles cleanly to <= BRASS_BOUNCE_MAX_PER_WINDOW
    let played = 0;
    for (let i = 0; i < 20; i++) {
      if (playBrassCasingBounceSound('792_mauser', 165, 1, 2000 + i * 10)) {
        played++;
      }
    }
    expect(played).toBeGreaterThanOrEqual(2);
    expect(played).toBeLessThanOrEqual(BRASS_BOUNCE_MAX_PER_WINDOW);
    // Verify drawn-brass fundamental around 7.92 Mauser casingRingHz (2340 Hz)
    const mauserRingHz = CALIBER_ACOUSTIC_PROFILES['792_mauser'].casingRingHz;
    expect(log.oscFreqs.some((f) => Math.abs(f - mauserRingHz) < 120)).toBe(
      true
    );

    // Minimum spacing guard rejects second bounce < BRASS_BOUNCE_MIN_INTERVAL_MS later
    resetMechanicalSoundEngine();
    expect(playBrassCasingBounceSound('556_nato', 150, 1, 5000)).toBe(true);
    expect(
      playBrassCasingBounceSound(
        '556_nato',
        150,
        2,
        5000 + BRASS_BOUNCE_MIN_INTERVAL_MS - 5
      )
    ).toBe(false);
    expect(
      playBrassCasingBounceSound(
        '556_nato',
        120,
        2,
        5000 + BRASS_BOUNCE_MIN_INTERVAL_MS + 2
      )
    ).toBe(true);

    // BallisticsSystem.tsx wires & tears down setCasingBounceListener cleanly
    const ballisticsSrc = fs.readFileSync(
      path.join(ROOT, 'src/engine/actors/BallisticsSystem.tsx'),
      'utf8'
    );
    expect(ballisticsSrc).toContain('setCasingBounceListener(');
    expect(ballisticsSrc).toContain('playBrassCasingBounceSound(');
    expect(ballisticsSrc).toContain('setCasingBounceListener(null)');
  });

  it('3. Master DynamicsCompressorNode soft-ceiling limiter sits before destination and degrades gracefully when unavailable', () => {
    // 3a. Full Web Audio context -> limiter configured with MASTER_SOFT_LIMITER_CONFIG right before destination
    const fullLog: RecordedAudioGraph = {
      oscFreqs: [],
      filterFreqs: [],
      limiterConfigs: [],
      connections: [],
    };
    (globalThis as Record<string, unknown>).window = {
      AudioContext: createMockAudioContextClass(fullLog, {
        withDynamicsCompressor: true,
      }),
    };
    unlockMechanicalAudio();
    expect(hasMasterSoftCeilingLimiter()).toBe(true);
    expect(fullLog.limiterConfigs).toHaveLength(1);
    expect(fullLog.limiterConfigs[0]).toEqual({
      threshold: MASTER_SOFT_LIMITER_CONFIG.thresholdDb,
      knee: MASTER_SOFT_LIMITER_CONFIG.kneeDb,
      ratio: MASTER_SOFT_LIMITER_CONFIG.ratio,
      attack: MASTER_SOFT_LIMITER_CONFIG.attackSec,
      release: MASTER_SOFT_LIMITER_CONFIG.releaseSec,
    });
    expect(
      fullLog.connections.some(
        ([from, to]) => from === 'limiter' && to === 'destination'
      )
    ).toBe(true);

    // 3b. Headless / minimal mock AudioContext WITHOUT createDynamicsCompressor -> zero throw, audio still plays!
    resetMechanicalSoundEngine();
    const minimalLog: RecordedAudioGraph = {
      oscFreqs: [],
      filterFreqs: [],
      limiterConfigs: [],
      connections: [],
    };
    (globalThis as Record<string, unknown>).window = {
      AudioContext: createMockAudioContextClass(minimalLog, {
        withDynamicsCompressor: false,
      }),
    };

    expect(() => {
      unlockMechanicalAudio();
      playWeaponFiringEventSound('primer_ignition', 'gau8', 1.0);
      playBrassCasingBounceSound('45_acp', 140, 1, 9000);
    }).not.toThrow();
    expect(hasMasterSoftCeilingLimiter()).toBe(false);
    expect(
      minimalLog.connections.some(
        ([from, to]) => from === 'gain' && to === 'destination'
      )
    ).toBe(true);
    expect(minimalLog.oscFreqs.length).toBeGreaterThan(0);
  });

  it('4. V6 platform recoil kinematics parity: Thompson < M1911 in .45 ACP, MG 42 < K98k in 7.92mm, and GAU-8 strongly damped climb', () => {
    // Zero-GC cached attenuation objects
    expect(getWeaponRecoilAttenuation('m1911')).toBe(
      getWeaponRecoilAttenuation('m1911')
    );

    const sampleShot = (weaponId: WeaponId, caliber: CaliberProfile) => {
      resetArmoryPhysics();
      applyArmoryShot(caliber, 1.0, weaponId);
      const s = getArmoryPhysicsState();
      return {
        kickVel: Math.abs(s.recoilVelX),
        riseVel: s.recoilVelY,
        climbVel: s.recoilPitchVel,
      };
    };

    // Same .45 ACP caliber: 4.9 kg Cutts-compensated Thompson < 1.1 kg M1911 pistol (and Vector lowest climb)
    const m1911Shot = sampleShot('m1911', '45_acp');
    const thompsonShot = sampleShot('thompson', '45_acp');
    const vectorShot = sampleShot('vector', '45_acp');
    expect(thompsonShot.kickVel).toBeLessThan(m1911Shot.kickVel);
    expect(thompsonShot.riseVel).toBeLessThan(m1911Shot.riseVel);
    expect(thompsonShot.climbVel).toBeLessThan(m1911Shot.climbVel * 0.35);
    expect(vectorShot.climbVel).toBeLessThan(thompsonShot.climbVel);

    // Same 7.92×57mm caliber: 11.6 kg inline bipod MG 42 < 4.1 kg Mauser K98k rifle
    const k98kShot = sampleShot('k98k', '792_mauser');
    const mg42Shot = sampleShot('mg42', '792_mauser');
    expect(mg42Shot.kickVel).toBeLessThan(k98kShot.kickVel);
    expect(mg42Shot.climbVel).toBeLessThan(k98kShot.climbVel * 0.6);

    // 1,828 kg airframe-mounted GAU-8/A: strong steady axial kick, minimal damped pitch climb
    const gau8Shot = sampleShot('gau8', '30x173_gau8');
    expect(gau8Shot.kickVel).toBeGreaterThan(k98kShot.kickVel);
    expect(getWeaponRecoilAttenuation('gau8').climbMult).toBeLessThanOrEqual(
      0.2
    );
    expect(gau8Shot.climbVel).toBeLessThan(m1911Shot.climbVel * 0.1);
  });
});
