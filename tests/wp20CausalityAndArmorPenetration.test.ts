import { describe, expect, it } from 'vitest';
import {
  CAUSALITY_PRESETS,
  evaluateCausalityPhysics,
} from '../src/engine/physics/causalitySandbox';
import {
  ARMOR_TARGET_TANK_IDS,
  ARMOR_ZONE_IDS,
  evaluateArmorPenetration,
  PENETRATOR_IDS,
} from '../src/engine/physics/armorPenetration';
import { CAUSALITY_SANDBOX_STRINGS } from '../src/features/sandbox/causalitySandboxStrings';
import { ARMOR_PENETRATION_STRINGS } from '../src/features/armorlab/armorPenetrationStrings';

const CJK_REGEX = /[\u4e00-\u9fff]/;

describe('WP-20 Causality Sandbox & Armor Penetration Physics', () => {
  it('reproduces factory baseline at 1.0x parameters and detects overgas vs short-stroke regimes', () => {
    const base = evaluateCausalityPhysics('ak15', CAUSALITY_PRESETS.factory);
    expect(base.status).toBe('nominal');
    expect(base.strokeRatio).toBeCloseTo(1.0, 3);
    expect(base.modifiedRpm).toBeCloseTo(base.baselineRpm, 1);

    const overgas = evaluateCausalityPhysics(
      'm4a1',
      CAUSALITY_PRESETS.suppressed_overgas
    );
    expect(overgas.modifiedRpm).toBeGreaterThan(overgas.baselineRpm);
    expect(overgas.unlockProgressF).toBeLessThan(overgas.baselineUnlockF);
    expect(['overgassed_early_unlock', 'excessive_bolt_velocity']).toContain(
      overgas.status
    );

    const underpower = evaluateCausalityPhysics(
      'scar',
      CAUSALITY_PRESETS.subsonic_underpower
    );
    expect(underpower.strokeRatio).toBeLessThan(0.8);
    expect(underpower.status).toBe('short_stroke_fte');
  });

  it('maintains monotonic range decay, obliquity RHAe growth, ERA defeat, and critical ricochet', () => {
    const close = evaluateArmorPenetration({
      projectileId: '125mm_apfsds',
      targetTankId: 'ztz99a',
      zoneId: 'turret_front',
      rangeM: 500,
      obliquityDeg: 0,
      eraEnabled: false,
    });
    const far = evaluateArmorPenetration({
      projectileId: '125mm_apfsds',
      targetTankId: 'ztz99a',
      zoneId: 'turret_front',
      rangeM: 3500,
      obliquityDeg: 0,
      eraEnabled: false,
    });
    expect(close.impactVelocityMps).toBeGreaterThan(far.impactVelocityMps);
    expect(close.penetrationDepthRhaeMm).toBeGreaterThan(
      far.penetrationDepthRhaeMm
    );

    const withEra = evaluateArmorPenetration({
      projectileId: '120mm_apfsds',
      targetTankId: 'ztz99a',
      zoneId: 'turret_front',
      rangeM: 1500,
      obliquityDeg: 10,
      eraEnabled: true,
    });
    const noEra = evaluateArmorPenetration({
      projectileId: '120mm_apfsds',
      targetTankId: 'ztz99a',
      zoneId: 'turret_front',
      rangeM: 1500,
      obliquityDeg: 10,
      eraEnabled: false,
    });
    expect(withEra.effectiveRhaeMm).toBeGreaterThan(noEra.effectiveRhaeMm);
    expect(withEra.penetrationDepthRhaeMm).toBeLessThan(
      noEra.penetrationDepthRhaeMm
    );

    const ricochet = evaluateArmorPenetration({
      projectileId: '88mm_pzgr39',
      targetTankId: 'm1a2',
      zoneId: 'upper_glacis',
      rangeM: 1000,
      obliquityDeg: 68,
      eraEnabled: false,
    });
    expect(ricochet.outcome).toBe('ricochet');

    const overmatchSide = evaluateArmorPenetration({
      projectileId: '125mm_apfsds',
      targetTankId: 'tiger1',
      zoneId: 'hull_side',
      rangeM: 1000,
      obliquityDeg: 0,
      eraEnabled: false,
    });
    expect(overmatchSide.outcome).toBe('perforation');

    expect(PENETRATOR_IDS.length).toBe(5);
    expect(ARMOR_TARGET_TANK_IDS.length).toBe(4);
    expect(ARMOR_ZONE_IDS.length).toBe(4);
  });

  it('keeps English localization free of CJK characters', () => {
    expect(CJK_REGEX.test(JSON.stringify(CAUSALITY_SANDBOX_STRINGS.en))).toBe(
      false
    );
    expect(CJK_REGEX.test(JSON.stringify(ARMOR_PENETRATION_STRINGS.en))).toBe(
      false
    );
  });
});
