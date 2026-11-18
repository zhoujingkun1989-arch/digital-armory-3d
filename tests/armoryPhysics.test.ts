import { beforeEach, describe, expect, it } from 'vitest';
import {
  AMBIENT_TEMP_C,
  ARCHERY_PROFILES,
  BALLISTIC_CALIBERS,
  BRASS_AUDIBLE_IMPACT_CMS,
  BRASS_MAX_AUDIBLE_BOUNCES,
  CALIBER_BALLISTICS,
  DEFAULT_FIRING_TIMING,
  MAX_BARREL_TEMP_C,
  SPENT_CASING_POOL_SIZE,
  WEAPON_FIRING_TIMING,
  computeCasingContactHeight,
  computeGasPortUncoverF,
  computePeakPressureF,
  computeSafeUnlockF,
  countActiveSpentCasings,
  createArmoryPhysicsInput,
  createInternalBallisticsSample,
  evaluateInternalBallistics,
  evaluateInternalBallisticsInto,
  getArmoryPhysicsState,
  getSmokeWispPool,
  getSpentCasingPool,
  isArcheryCaliber,
  isArcheryWeapon,
  resetArmoryPhysics,
  seedArmoryPhysicsRng,
  setBrassFloorImpactListener,
  stepArmoryPhysics,
  type ArmoryPhysicsInput,
} from '../src/engine/physics/armoryPhysics';
import { TELEMETRY_HUD_STRINGS } from '../src/features/workbench/BallisticsTelemetryHud';
import type { CaliberProfile } from '../src/weapons/types';
import { WEAPON_IDS } from '../src/weapons/types';

const EXPECTED_PMAX: Record<CaliberProfile, number> = {
  '9mm_para': 241,
  '45_acp': 145,
  '57_28': 345,
  '357_magnum': 241,
  '556_nato': 430,
  '762_m43': 355,
  '50_ae': 248,
  '12_gauge': 79,
  '30_06': 345,
  '338_lapua': 420,
  '50_bmg': 379,
  arrow_400gr: 311,
  bolt_400gr: 1334,
};

const DT = 1 / 60;

function makeInput(weaponId: ArmoryPhysicsInput['weaponId']): ArmoryPhysicsInput {
  const input = createArmoryPhysicsInput();
  input.weaponId = weaponId;
  input.caliber = '556_nato';
  input.firing = true;
  input.floorY = -24;
  input.muzzleX = 24;
  input.muzzleY = 1;
  input.ejectPortX = 3;
  input.ejectPortY = 1.2;
  input.ejectPortZ = 0.8;
  input.casingScale = 0.62;
  return input;
}

/** Plays one complete firing cycle f: 0 → 1 at `rate` progress per second. */
function playCycle(input: ArmoryPhysicsInput, rate = 0.42): void {
  let f = 0;
  input.fireProgress = 0;
  stepArmoryPhysics(DT, input);
  while (f < 0.999) {
    f = Math.min(0.999, f + rate * DT);
    input.fireProgress = f;
    stepArmoryPhysics(DT, input);
  }
}

describe('SAAMI / CIP internal ballistics model', () => {
  it('covers all 11 firearm/shotgun calibers with authentic peak chamber pressures', () => {
    expect(BALLISTIC_CALIBERS).toHaveLength(11);
    for (const cal of BALLISTIC_CALIBERS) {
      expect(CALIBER_BALLISTICS[cal].peakPressureMPa).toBe(EXPECTED_PMAX[cal]);
    }
    expect(evaluateInternalBallistics('9x19', computePeakPressureF('9x19')).pressureMPa).toBeCloseTo(241, 4);
    expect(evaluateInternalBallistics('45_acp', computePeakPressureF('45_acp')).pressureMPa).toBeCloseTo(145, 4);
    expect(evaluateInternalBallistics('57x28', computePeakPressureF('57x28')).pressureMPa).toBeCloseTo(345, 4);
  });

  it('reproduces the SAAMI/CIP peak pressure exactly at the peak sample', () => {
    const out = createInternalBallisticsSample();
    for (const cal of BALLISTIC_CALIBERS) {
      let maxP = 0;
      let maxF = 0;
      for (let i = 0; i <= 4000; i++) {
        const f = i / 4000;
        evaluateInternalBallisticsInto(cal, f, out);
        if (out.pressureMPa > maxP) {
          maxP = out.pressureMPa;
          maxF = f;
        }
      }
      expect(maxP).toBeGreaterThan(EXPECTED_PMAX[cal] * 0.995);
      expect(maxP).toBeLessThanOrEqual(EXPECTED_PMAX[cal] * 1.0001);
      // Default timing: ignition 0.14 → peak ≈ 0.1975..0.215 → muzzle exit 0.30
      expect(maxF).toBeCloseTo(computePeakPressureF(cal), 2);
      expect(maxF).toBeGreaterThan(0.19);
      expect(maxF).toBeLessThan(0.22);
    }
  });

  it('bore velocity rises monotonically from 0 to V0 at muzzle exit', () => {
    const out = createInternalBallisticsSample();
    for (const cal of BALLISTIC_CALIBERS) {
      const spec = CALIBER_BALLISTICS[cal];
      let prevV = -1;
      let prevX = -1;
      for (let i = 0; i <= 1000; i++) {
        evaluateInternalBallisticsInto(cal, i / 1000, out);
        expect(out.velocityMps).toBeGreaterThanOrEqual(prevV - 1e-9);
        expect(out.boreTravelRatio).toBeGreaterThanOrEqual(prevX - 1e-9);
        prevV = out.velocityMps;
        prevX = out.boreTravelRatio;
      }
      expect(evaluateInternalBallistics(cal, 0.1).velocityMps).toBe(0);
      const exit = evaluateInternalBallistics(cal, DEFAULT_FIRING_TIMING.muzzleExitF);
      expect(exit.velocityMps).toBeCloseTo(spec.muzzleVelocityMps, 3);
      expect(exit.boreTravelRatio).toBeCloseTo(1, 5);
      expect(exit.energyJ).toBeCloseTo(spec.muzzleEnergyJ, 3);
    }
  });

  it('derives muzzle energies from ½·m·V0² (9mm ≈ 518 J vs .50 BMG ≈ 15.6 kJ)', () => {
    expect(CALIBER_BALLISTICS['9mm_para'].muzzleEnergyJ).toBeCloseTo(518.4, 1);
    expect(CALIBER_BALLISTICS['50_bmg'].muzzleEnergyJ).toBeGreaterThan(15000);
    for (const cal of BALLISTIC_CALIBERS) {
      const s = CALIBER_BALLISTICS[cal];
      expect(s.muzzleEnergyJ).toBeCloseTo(
        0.5 * (s.projectileMassG / 1000) * s.muzzleVelocityMps ** 2,
        6
      );
      expect(s.boreTimeMs).toBeGreaterThan(0);
      expect(s.safeUnlockPressureMPa).toBeLessThan(s.peakPressureMPa * 0.1);
    }
  });

  it('flags the pressure-locked window and opens the safe-unlock window after blowdown', () => {
    for (const cal of BALLISTIC_CALIBERS) {
      const peakF = computePeakPressureF(cal);
      const safeF = computeSafeUnlockF(cal);
      expect(safeF).toBeGreaterThan(DEFAULT_FIRING_TIMING.muzzleExitF);
      expect(safeF).toBeLessThan(DEFAULT_FIRING_TIMING.ejectF);
      expect(evaluateInternalBallistics(cal, peakF).isOverSafeUnlockThreshold).toBe(
        true
      );
      const after = evaluateInternalBallistics(cal, safeF + 0.002);
      expect(after.isOverSafeUnlockThreshold).toBe(false);
      expect(after.phase).toBe('extraction');
      expect(evaluateInternalBallistics(cal, 0.05).phase).toBe('cocked');
      expect(evaluateInternalBallistics(cal, 0.95).phase).toBe('lockup');
    }
  });

  it('only pressurises the gas port after the projectile uncovers it', () => {
    const t = WEAPON_FIRING_TIMING.m4a1;
    const uncoverF = computeGasPortUncoverF('556_nato', t);
    expect(uncoverF).not.toBeNull();
    const before = evaluateInternalBallistics('556_nato', (uncoverF as number) - 0.004, t);
    const after = evaluateInternalBallistics('556_nato', (uncoverF as number) + 0.002, t);
    expect(before.gasPortPressureMPa).toBe(0);
    expect(after.gasPortPressureMPa).toBeGreaterThan(30);
    expect(after.gasPortPressureMPa).toBeLessThan(after.pressureMPa);
    // Non-gas-operated weapons never tap the bore (including Colt Python .357 revolver)
    expect(computeGasPortUncoverF('9mm_para', WEAPON_FIRING_TIMING.g17)).toBeNull();
    expect(computeGasPortUncoverF('357_magnum', WEAPON_FIRING_TIMING.python)).toBeNull();
    expect(
      evaluateInternalBallistics('50_bmg', 0.2, WEAPON_FIRING_TIMING.m82a1)
        .gasPortPressureMPa
    ).toBe(0);

    // Benelli M4 chamber-mounted ARGO (early gas tap) vs M1 Garand muzzle gas cylinder (late gas tap)
    const argoUncover = computeGasPortUncoverF('12_gauge', WEAPON_FIRING_TIMING.benellim4);
    const garandUncover = computeGasPortUncoverF('30_06', WEAPON_FIRING_TIMING.garand);
    expect(argoUncover).not.toBeNull();
    expect(garandUncover).not.toBeNull();
    expect(
      evaluateInternalBallistics('12_gauge', (argoUncover as number) + 0.01, WEAPON_FIRING_TIMING.benellim4)
        .gasPortPressureMPa
    ).toBeGreaterThan(10);
    expect(
      evaluateInternalBallistics('30_06', (garandUncover as number) + 0.002, WEAPON_FIRING_TIMING.garand)
        .gasPortPressureMPa
    ).toBeGreaterThan(15);

    // V2.0 BAY-17..19: M249 SAW taps underbarrel gas block, while P08 toggle-lock & Vector Super V have no gas port
    const m249Uncover = computeGasPortUncoverF('556_nato', WEAPON_FIRING_TIMING.m249);
    expect(m249Uncover).not.toBeNull();
    expect(
      evaluateInternalBallistics('556_nato', (m249Uncover as number) + 0.003, WEAPON_FIRING_TIMING.m249)
        .gasPortPressureMPa
    ).toBeGreaterThan(20);
    expect(computeGasPortUncoverF('9mm_para', WEAPON_FIRING_TIMING.p08)).toBeNull();
    expect(computeGasPortUncoverF('45_acp', WEAPON_FIRING_TIMING.vector)).toBeNull();
  });

  it('defines ordered firing timing for all 19 exhibits and retains revolver brass inside cylinder', () => {
    expect(WEAPON_IDS).toHaveLength(19);
    for (const id of WEAPON_IDS) {
      const t = WEAPON_FIRING_TIMING[id];
      expect(t.ignitionF).toBeLessThan(t.muzzleExitF);
      expect(t.muzzleExitF).toBeLessThan(t.ejectF);
      expect(t.ejectF).toBeLessThan(t.batteryF);
      expect(Math.hypot(t.ejectDirX, t.ejectDirY, t.ejectDirZ)).toBeCloseTo(1, 6);
    }

    // Colt Python .357 revolver retains fired brass in cylinder (`ejectSpeedCmS === 0`) while heating barrel
    resetArmoryPhysics();
    const pyInput = makeInput('python');
    pyInput.caliber = '357_magnum';
    pyInput.hasGasVent = false;
    for (let i = 0; i < 3; i++) playCycle(pyInput, 4);
    expect(getArmoryPhysicsState().shotCount).toBe(3);
    expect(getArmoryPhysicsState().barrelTempC).toBeGreaterThan(AMBIENT_TEMP_C + 20);
    expect(countActiveSpentCasings()).toBe(0);
  });

  it('models archery draw-force, let-off & power-stroke curves for arrow_400gr and bolt_400gr with zero heat, brass or smoke', () => {
    expect(ARCHERY_PROFILES).toEqual(['arrow_400gr', 'bolt_400gr']);
    expect(isArcheryCaliber('arrow_400gr')).toBe(true);
    expect(isArcheryCaliber('bolt_400gr')).toBe(true);
    expect(isArcheryCaliber('556_nato')).toBe(false);
    expect(isArcheryWeapon('lift33')).toBe(true);
    expect(isArcheryWeapon('r500')).toBe(true);
    expect(isArcheryWeapon('m4a1')).toBe(false);

    for (const [cal, wid] of [
      ['arrow_400gr', 'lift33'],
      ['bolt_400gr', 'r500'],
    ] as const) {
      const spec = CALIBER_BALLISTICS[cal];
      const timing = WEAPON_FIRING_TIMING[wid];
      expect(spec.standard).toBe('ATA / IBO');
      expect(spec.peakPressureMPa).toBe(EXPECTED_PMAX[cal]);
      expect(spec.heatPerShotC).toBe(0);
      expect(spec.foulingPerShot).toBe(0);
      expect(spec.ejectSpeedCmS).toBe(0);
      expect(spec.shockDiamonds).toBe(0);
      expect(spec.archerySpec).toBeDefined();
      expect(spec.muzzleEnergyJ).toBeCloseTo(
        0.5 * (spec.projectileMassG / 1000) * spec.muzzleVelocityMps ** 2,
        5
      );

      // Draw ramp -> let-off valley before release -> power-stroke acceleration to V0
      const valley = evaluateInternalBallistics(cal, timing.ignitionF - 0.02, timing);
      expect(valley.velocityMps).toBe(0);
      expect(valley.pressureMPa).toBeCloseTo(spec.archerySpec!.holdingForceN, 0);

      let prevV = 0;
      for (let f = timing.ignitionF; f <= timing.muzzleExitF + 1e-6; f += 0.01) {
        const s = evaluateInternalBallistics(cal, f, timing);
        expect(s.velocityMps).toBeGreaterThanOrEqual(prevV - 1e-6);
        expect(s.gasPortPressureMPa).toBe(0);
        prevV = s.velocityMps;
      }
      const exitSample = evaluateInternalBallistics(cal, timing.muzzleExitF, timing);
      expect(exitSample.velocityMps).toBeCloseTo(spec.muzzleVelocityMps, 2);
      expect(exitSample.boreTravelRatio).toBeCloseTo(1, 5);
    }

    // stepArmoryPhysics spawns zero spent brass, zero smoke wisps, and keeps ambient barrel temp
    resetArmoryPhysics();
    for (const [wid, cal] of [
      ['lift33', 'arrow_400gr'],
      ['r500', 'bolt_400gr'],
    ] as const) {
      const input = makeInput(wid);
      input.caliber = cal;
      input.hasGasVent = false;
      for (let i = 0; i < 5; i++) playCycle(input, 4);
      const st = getArmoryPhysicsState();
      expect(st.shotCount).toBe(5);
      expect(st.barrelTempC).toBe(AMBIENT_TEMP_C);
      expect(st.barrelHeat01).toBe(0);
      expect(st.carbonFouling01).toBe(0);
      expect(countActiveSpentCasings()).toBe(0);
      expect(getSmokeWispPool().some((w) => w.active)).toBe(false);
    }
  });

  it('Into variant is allocation-free and returns the same struct', () => {
    const out = createInternalBallisticsSample();
    expect(evaluateInternalBallisticsInto('762_m43', 0.25, out)).toBe(out);
  });
});

describe('60Hz recoil, harmonics & thermal micro-physics', () => {
  beforeEach(() => {
    resetArmoryPhysics();
    seedArmoryPhysicsRng(1234);
    setBrassFloorImpactListener(null);
  });

  it('kicks the weapon rearward + muzzle up at ignition and damps back to 0', () => {
    const input = makeInput('m4a1');
    const t = WEAPON_FIRING_TIMING.m4a1;
    input.fireProgress = t.ignitionF - 0.005;
    stepArmoryPhysics(DT, input);
    input.fireProgress = t.ignitionF + 0.005;
    stepArmoryPhysics(DT, input);
    let minX = 0;
    let maxPitch = 0;
    for (let i = 0; i < 30; i++) {
      stepArmoryPhysics(DT, input);
      const s = getArmoryPhysicsState();
      minX = Math.min(minX, s.recoilOffsetX);
      maxPitch = Math.max(maxPitch, s.recoilPitchZ);
    }
    const spec = CALIBER_BALLISTICS['556_nato'];
    expect(getArmoryPhysicsState().shotCount).toBe(1);
    expect(minX).toBeLessThan(-spec.recoilKickCm * 0.85);
    expect(minX).toBeGreaterThan(-spec.recoilKickCm * 1.15);
    expect(maxPitch).toBeGreaterThan(spec.muzzleClimbRad * 0.85);

    for (let i = 0; i < 60 * 6; i++) stepArmoryPhysics(DT, input);
    const s = getArmoryPhysicsState();
    expect(Math.abs(s.recoilOffsetX)).toBeLessThan(1e-4);
    expect(Math.abs(s.recoilOffsetY)).toBeLessThan(1e-4);
    expect(Math.abs(s.recoilPitchZ)).toBeLessThan(1e-5);
    expect(Math.abs(s.barrelWhipY)).toBeLessThan(1e-6);
  });

  it('excites the 0.12cm bolt-carrier battery bounce ripple then settles', () => {
    const input = makeInput('m4a1');
    const t = WEAPON_FIRING_TIMING.m4a1;
    input.fireProgress = t.batteryF - 0.01;
    stepArmoryPhysics(DT, input);
    input.fireProgress = t.batteryF + 0.001;
    stepArmoryPhysics(1e-5, input);
    expect(getArmoryPhysicsState().boltBounceX).toBeCloseTo(0.12, 2);
    for (let i = 0; i < 60; i++) stepArmoryPhysics(DT, input);
    expect(Math.abs(getArmoryPhysicsState().boltBounceX)).toBeLessThan(1e-6);
  });

  it('heats the barrel per shot, clamps at 580°C and Newton-cools toward ambient', () => {
    const input = makeInput('m4a1');
    for (let i = 0; i < 10; i++) playCycle(input, 4);
    const s = getArmoryPhysicsState();
    expect(s.shotCount).toBe(10);
    expect(s.barrelTempC).toBeGreaterThan(AMBIENT_TEMP_C + 100);
    expect(s.barrelHeat01).toBeGreaterThan(0.15);
    expect(s.carbonFouling01).toBeGreaterThan(0.1);

    const hot = s.barrelTempC;
    for (let i = 0; i < 60 * 10; i++) stepArmoryPhysics(DT, input);
    const cooled = getArmoryPhysicsState().barrelTempC;
    expect(cooled).toBeLessThan(hot);
    // Exponential decay: ΔT(10s) = ΔT0 · e^(−0.045·10)
    expect(cooled - AMBIENT_TEMP_C).toBeCloseTo(
      (hot - AMBIENT_TEMP_C) * Math.exp(-0.45),
      0
    );
    for (let i = 0; i < 60 * 300; i++) stepArmoryPhysics(DT, input);
    expect(getArmoryPhysicsState().barrelTempC).toBeLessThan(AMBIENT_TEMP_C + 1);

    resetArmoryPhysics();
    const bmg = makeInput('m82a1');
    bmg.caliber = '50_bmg';
    for (let i = 0; i < 60; i++) playCycle(bmg, 12);
    expect(getArmoryPhysicsState().barrelTempC).toBeLessThanOrEqual(MAX_BARREL_TEMP_C);
    expect(getArmoryPhysicsState().barrelHeat01).toBeLessThanOrEqual(1);
    expect(getArmoryPhysicsState().carbonFouling01).toBeLessThanOrEqual(1);
  });

  it('spawns muzzle, chamber and vent smoke wisps that rise and fade', () => {
    const input = makeInput('m4a1');
    input.hasGasVent = true;
    playCycle(input);
    const active = getSmokeWispPool().filter((w) => w.active);
    expect(active.length).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < 60 * 5; i++) stepArmoryPhysics(DT, input);
    expect(getSmokeWispPool().some((w) => w.kind !== 3 && w.active)).toBe(false);
  });
});

describe('16-slot rigid-body spent brass pool', () => {
  beforeEach(() => {
    resetArmoryPhysics();
    seedArmoryPhysicsRng(42);
    setBrassFloorImpactListener(null);
  });

  it('ejects at the port, falls under -981 cm/s² and bounces on the mat', () => {
    const impacts: number[] = [];
    setBrassFloorImpactListener((cal, speed) => {
      expect(cal).toBe('556_nato');
      impacts.push(speed);
    });
    const input = makeInput('m4a1');
    const t = WEAPON_FIRING_TIMING.m4a1;
    input.fireProgress = t.ejectF - 0.005;
    stepArmoryPhysics(DT, input);
    input.fireProgress = t.ejectF + 0.001;
    stepArmoryPhysics(1e-6, input);

    const casing = getSpentCasingPool().find((c) => c.active);
    expect(casing).toBeDefined();
    const c = casing!;
    expect(c.px).toBeCloseTo(input.ejectPortX, 1);
    expect(c.py).toBeCloseTo(input.ejectPortY, 1);
    expect(c.vz).toBeGreaterThan(80); // thrown out the right-side port
    expect(Math.abs(c.wx)).toBeGreaterThanOrEqual(18);
    expect(Math.abs(c.wx)).toBeLessThanOrEqual(38);

    // Gravity: Δvy over 0.05s ≈ −981·0.05 (minus tiny drag)
    const vy0 = c.vy;
    for (let i = 0; i < 3; i++) stepArmoryPhysics(DT, input);
    expect(c.vy - vy0).toBeLessThan(-981 * 0.05 * 0.95);
    expect(c.vy - vy0).toBeGreaterThan(-981 * 0.05 * 1.05 - Math.abs(vy0) * 0.02);

    let minAboveFloor = Infinity;
    for (let i = 0; i < 60 * 4; i++) {
      stepArmoryPhysics(DT, input);
      minAboveFloor = Math.min(
        minAboveFloor,
        c.py - computeCasingContactHeight(c) - input.floorY
      );
    }
    expect(minAboveFloor).toBeGreaterThan(-1e-6);
    expect(c.bounces).toBeGreaterThanOrEqual(2);
    expect(c.resting).toBe(true);
    expect(c.vx).toBe(0);
    expect(c.vy).toBe(0);
    expect(c.py).toBeCloseTo(input.floorY + computeCasingContactHeight(c), 3);
    expect(c.pz).toBeLessThanOrEqual(input.matMaxZ);
    expect(c.heat01).toBeLessThan(0.4);

    expect(impacts.length).toBeGreaterThanOrEqual(1);
    expect(impacts.length).toBeLessThanOrEqual(BRASS_MAX_AUDIBLE_BOUNCES);
    for (const sp of impacts) expect(sp).toBeGreaterThan(BRASS_AUDIBLE_IMPACT_CMS);
    // Restitution 0.38: successive audible impacts get quieter
    for (let i = 1; i < impacts.length; i++) {
      expect(impacts[i]).toBeLessThan(impacts[i - 1]);
    }
  });

  it('ejects FN P90 brass downward through the grip chute', () => {
    const input = makeInput('p90');
    input.caliber = '57_28';
    const t = WEAPON_FIRING_TIMING.p90;
    input.fireProgress = t.ejectF - 0.005;
    stepArmoryPhysics(DT, input);
    input.fireProgress = t.ejectF + 0.001;
    stepArmoryPhysics(1e-6, input);
    const c = getSpentCasingPool().find((x) => x.active)!;
    expect(c.vy).toBeLessThan(-80);
  });

  it('recycles the oldest of 16 persistent casings and never allocates more', () => {
    const input = makeInput('m4a1');
    const pool = getSpentCasingPool();
    for (let i = 0; i < 20; i++) playCycle(input, 6);
    expect(pool).toHaveLength(SPENT_CASING_POOL_SIZE);
    expect(getSpentCasingPool()).toBe(pool);
    expect(countActiveSpentCasings()).toBe(SPENT_CASING_POOL_SIZE);
    expect(getArmoryPhysicsState().shotCount).toBe(20);
  });

  it('does not fire events when scrubbing backwards, teleporting or outside firing mode', () => {
    const input = makeInput('m4a1');
    input.fireProgress = 0.9;
    stepArmoryPhysics(DT, input);
    input.fireProgress = 0.1; // backward scrub (not a loop wrap)
    stepArmoryPhysics(DT, input);
    input.fireProgress = 0.95; // teleport jump
    stepArmoryPhysics(DT, input);
    input.firing = false;
    playCycle(input);
    expect(getArmoryPhysicsState().shotCount).toBe(0);
    expect(countActiveSpentCasings()).toBe(0);
  });

  it('resets thermal state and clears brass when switching weapons', () => {
    const input = makeInput('m4a1');
    playCycle(input);
    expect(countActiveSpentCasings()).toBe(1);
    input.weaponId = 'ak15';
    input.caliber = '762_m43';
    input.fireProgress = 0;
    stepArmoryPhysics(DT, input);
    expect(countActiveSpentCasings()).toBe(0);
    expect(getArmoryPhysicsState().shotCount).toBe(0);
    expect(getArmoryPhysicsState().barrelTempC).toBe(AMBIENT_TEMP_C);
  });
});

describe('WP-04 telemetry HUD bilingual labels', () => {
  it('provides 100% zh/en key parity with non-empty strings', () => {
    const zhKeys = Object.keys(TELEMETRY_HUD_STRINGS.zh).sort();
    const enKeys = Object.keys(TELEMETRY_HUD_STRINGS.en).sort();
    expect(enKeys).toEqual(zhKeys);
    for (const k of zhKeys) {
      const key = k as keyof (typeof TELEMETRY_HUD_STRINGS)['zh'];
      expect(String(TELEMETRY_HUD_STRINGS.zh[key]).trim().length).toBeGreaterThan(0);
      expect(String(TELEMETRY_HUD_STRINGS.en[key]).trim().length).toBeGreaterThan(0);
    }
  });
});
