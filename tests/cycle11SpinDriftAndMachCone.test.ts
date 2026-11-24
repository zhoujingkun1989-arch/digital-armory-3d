import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WEAPON_RIFLING_SPECS } from '../src/engine/ballistics/riflingSpecs';
import {
  buildDopeCardRows,
  computeBallisticSolution,
  computeGyroscopicSpinDriftCm,
  computeMillerGyroscopicStability,
  DEFAULT_EXTERNAL_BALLISTICS_ENVIRONMENT,
  EXTERNAL_PROJECTILE_ORDER,
  EXTERNAL_PROJECTILE_SPECS,
  interpolateTrajectoryAt,
  MULTI_ZERO_PRESETS_M,
} from '../src/engine/physics/externalBallistics';
import { ExternalBallisticsView } from '../src/features/ballistics/ExternalBallisticsView';
import { EXTERNAL_BALLISTICS_STRINGS } from '../src/features/ballistics/externalBallisticsStrings';
import {
  buildRangeTrajectory3D,
  computeMachConeState,
  computeWindFlagDeflectionRad,
  computeWindFlagStates,
  MACH_CONE_MIN_MACH,
} from '../src/features/ballistics/range3DMath';
import { useAppStore } from '../src/store/useAppStore';
import { isWeaponId } from '../src/weapons/types';

const REPO_ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const WP_BADGE_RE = /\bWP-\d+[a-z]?\b/i;

describe('Cycle 11A · Applied Ballistics Spin Drift (RH/LH), Miller Sg & Multi-Zero', () => {
  it('computes exact Litz spin drift (RH +, LH -, none 0) and maintains 23/23 riflingSpecs parity', () => {
    // Direct formula verification: SD_in = 1.25 * (SG + 1.2) * tof^1.83
    const expectedCm = 1.25 * (1.8 + 1.2) * Math.pow(1.5, 1.83) * 2.54;
    expect(computeGyroscopicSpinDriftCm(1.5, 1.8, 'RH')).toBeCloseTo(
      expectedCm,
      6
    );
    expect(computeGyroscopicSpinDriftCm(1.5, 1.8, 'LH')).toBeCloseTo(
      -expectedCm,
      6
    );
    expect(computeGyroscopicSpinDriftCm(1.5, 1.8, 'none')).toBe(0);
    expect(computeGyroscopicSpinDriftCm(0, 1.8, 'RH')).toBe(0);

    // 100% parity between all 23 EXTERNAL_PROJECTILE_SPECS and WEAPON_RIFLING_SPECS[primaryWeaponId]
    expect(EXTERNAL_PROJECTILE_ORDER).toHaveLength(23);
    for (const calId of EXTERNAL_PROJECTILE_ORDER) {
      const spec = EXTERNAL_PROJECTILE_SPECS[calId];
      expect(isWeaponId(spec.primaryWeaponId)).toBe(true);
      if (isWeaponId(spec.primaryWeaponId)) {
        const rifling = WEAPON_RIFLING_SPECS[spec.primaryWeaponId];
        expect(spec.twistDirection, `${calId} twistDirection`).toBe(
          rifling.direction
        );
        expect(spec.twistInches, `${calId} twistInches`).toBe(
          rifling.twistInches
        );
      }
    }

    // Representative museum exhibits: AWM (RH +), Colt M1911A1 (LH -), ZTZ-99A (0), LIFT 33 (0)
    const solAwm = computeBallisticSolution('338_lapua', {
      maxRangeM: 1000,
      zeroDistanceM: 100,
      crosswindMps: 0,
      includeSpinDrift: true,
    });
    const awm1k = interpolateTrajectoryAt(solAwm, 1000)!;
    expect(solAwm.twistDirection).toBe('RH');
    expect(awm1k.spinDriftCm).toBeGreaterThan(15);
    expect(awm1k.spinDriftCm).toBeLessThan(35);
    expect(awm1k.windDriftCm).toBeCloseTo(awm1k.spinDriftCm, 4);
    expect(awm1k.windageMil).toBeGreaterThan(0.15);

    const solM1911 = computeBallisticSolution('45_acp', {
      maxRangeM: 100,
      zeroDistanceM: 25,
      crosswindMps: 0,
      includeSpinDrift: true,
    });
    const m1911At100 = interpolateTrajectoryAt(solM1911, 100)!;
    expect(solM1911.twistDirection).toBe('LH');
    expect(m1911At100.spinDriftCm).toBeLessThan(-2);
    expect(m1911At100.windDriftCm).toBeCloseTo(m1911At100.spinDriftCm, 4);
    expect(m1911At100.windageMil).toBeLessThan(-0.2);

    const solZtz = computeBallisticSolution('125mm_apfsds', {
      maxRangeM: 1000,
      zeroDistanceM: 300,
      crosswindMps: 0,
      includeSpinDrift: true,
    });
    expect(solZtz.twistDirection).toBe('none');
    expect(interpolateTrajectoryAt(solZtz, 1000)!.spinDriftCm).toBe(0);
    expect(interpolateTrajectoryAt(solZtz, 1000)!.windDriftCm).toBe(0);

    const solBow = computeBallisticSolution('arrow_400gr', {
      maxRangeM: 100,
      zeroDistanceM: 25,
      crosswindMps: 0,
      includeSpinDrift: true,
    });
    expect(solBow.twistDirection).toBe('none');
    expect(interpolateTrajectoryAt(solBow, 100)!.spinDriftCm).toBe(0);

    // DOPE card and 3D Range impact both couple total lateral deflection (wind + spin)
    const dopeAwm = buildDopeCardRows(solAwm, [500, 1000]);
    expect(dopeAwm[1].spinDriftCm).toBeCloseTo(awm1k.spinDriftCm, 3);
    expect(dopeAwm[1].windDriftCm).toBeCloseTo(awm1k.windDriftCm, 3);

    const trajAwmElevOnly = buildRangeTrajectory3D(
      solAwm,
      1000,
      'elev_only',
      'steel_gong'
    );
    expect(trajAwmElevOnly.steelImpact.impactOffsetZCm).toBeCloseTo(
      awm1k.spinDriftCm,
      2
    );
  });

  it('classifies Don Miller gyroscopic stability (stable / marginal / unstable / fin_stabilized) accurately', () => {
    // Standard rifle & sniper loads are gyroscopically stable (Sg >= 1.5)
    for (const calId of [
      '338_lapua',
      '556_nato',
      '50_bmg',
      '762_m43',
      '30_06',
      '792_mauser',
      '30x173_gau8',
    ] as const) {
      const spec = EXTERNAL_PROJECTILE_SPECS[calId];
      const res = computeMillerGyroscopicStability(
        spec.caliberMm,
        spec.massGrains,
        spec.lengthCalibers,
        spec.twistInches,
        spec.muzzleVelocityMps,
        {
          isFinStabilized: spec.isFinStabilized,
          twistDirection: spec.twistDirection,
        }
      );
      expect(res.status, `${calId} stability status`).toBe('stable');
      expect(res.sg, `${calId} Sg`).toBeGreaterThanOrEqual(1.5);
    }

    // Smoothbore fin-stabilized APFSDS & fletched archery cleanly return 'fin_stabilized'
    const apfsds125 = EXTERNAL_PROJECTILE_SPECS['125mm_apfsds'];
    const st125 = computeMillerGyroscopicStability(
      apfsds125.caliberMm,
      apfsds125.massGrains,
      apfsds125.lengthCalibers,
      apfsds125.twistInches,
      apfsds125.muzzleVelocityMps
    );
    expect(st125.status).toBe('fin_stabilized');
    expect(st125.sg).toBe(0);

    const arrow = EXTERNAL_PROJECTILE_SPECS.arrow_400gr;
    const stArrow = computeMillerGyroscopicStability(
      arrow.caliberMm,
      arrow.massGrains,
      arrow.lengthCalibers,
      arrow.twistInches,
      arrow.muzzleVelocityMps
    );
    expect(stArrow.status).toBe('fin_stabilized');
    expect(stArrow.sg).toBe(0);

    // Slow-twist heavy long-bullet edge cases produce marginal & unstable classifications
    const marginal = computeMillerGyroscopicStability(5.7, 62, 4.05, 10.0, 910);
    expect(marginal.status).toBe('marginal');
    expect(marginal.sg).toBeGreaterThanOrEqual(1.0);
    expect(marginal.sg).toBeLessThan(1.5);

    const unstable = computeMillerGyroscopicStability(5.7, 62, 4.05, 14.0, 910);
    expect(unstable.status).toBe('unstable');
    expect(unstable.sg).toBeLessThan(1.0);
  });

  it('zeros trajectory elevation accurately across multi-zero distances (100 / 200 / 300 m)', () => {
    expect(MULTI_ZERO_PRESETS_M).toEqual([100, 200, 300]);
    expect(DEFAULT_EXTERNAL_BALLISTICS_ENVIRONMENT.includeSpinDrift).toBe(true);
    expect(DEFAULT_EXTERNAL_BALLISTICS_ENVIRONMENT.zeroDistanceM).toBe(100);

    const angles: number[] = [];
    for (const zeroM of MULTI_ZERO_PRESETS_M) {
      const sol = computeBallisticSolution('338_lapua', {
        maxRangeM: 1000,
        zeroDistanceM: zeroM,
        crosswindMps: 4.5,
        includeSpinDrift: true,
      });
      expect(sol.zeroRangeM).toBe(zeroM);
      const atZero = interpolateTrajectoryAt(sol, zeroM)!;
      expect(Math.abs(atZero.dropCm), `Zero error @ ${zeroM}m`).toBeLessThan(
        0.05
      );
      expect(Math.abs(atZero.holdoverMil)).toBeLessThan(0.01);
      angles.push(sol.zeroAngleRad);
    }

    // Longer zero distance demands strictly greater bore launch pitch angle
    expect(angles[1]).toBeGreaterThan(angles[0]);
    expect(angles[2]).toBeGreaterThan(angles[1]);
  });
});

describe('Cycle 11A · 3D Supersonic Mach-Cone Shockwave, Wind-Flag Deflection & UI Parity', () => {
  it('computes exact Mach-cone half-angle asin(1/M), hides subsonic/impacted, and deflects wind flags smoothly', () => {
    expect(MACH_CONE_MIN_MACH).toBe(1.02);

    const m5 = computeMachConeState(5.0, false);
    const m2 = computeMachConeState(2.0, false);
    const m11 = computeMachConeState(1.1, false);
    expect(m5.visible).toBe(true);
    expect(m2.visible).toBe(true);
    expect(m11.visible).toBe(true);
    expect(m5.halfAngleRad).toBeCloseTo(Math.asin(1 / 5.0), 6);
    expect(m2.halfAngleRad).toBeCloseTo(Math.asin(0.5), 6);
    expect(m11.halfAngleRad).toBeCloseTo(Math.asin(1 / 1.1), 6);
    // Cone widens monotonically as Mach decelerates toward Mach 1.0
    expect(m11.halfAngleRad).toBeGreaterThan(m2.halfAngleRad);
    expect(m2.halfAngleRad).toBeGreaterThan(m5.halfAngleRad);
    expect(m11.tanHalfAngle).toBeGreaterThan(m2.tanHalfAngle);
    expect(m2.tanHalfAngle).toBeGreaterThan(m5.tanHalfAngle);

    // Vanishes cleanly below Mach 1.02 or upon target impact
    expect(computeMachConeState(1.02, false).visible).toBe(false);
    expect(computeMachConeState(0.85, false).visible).toBe(false);
    expect(computeMachConeState(2.5, true).visible).toBe(false);

    // Wind flag deflection scales cleanly with speed & wind clock
    const calm = computeWindFlagDeflectionRad(0, 3);
    const med = computeWindFlagDeflectionRad(4.5, 3);
    const gale = computeWindFlagDeflectionRad(12, 3);
    const gale9 = computeWindFlagDeflectionRad(12, 9);
    const head12 = computeWindFlagDeflectionRad(10, 12);

    expect(calm.leanRad).toBeCloseTo(0, 6);
    expect(med.leanRad).toBeGreaterThan(calm.leanRad);
    expect(gale.leanRad).toBeGreaterThan(med.leanRad);
    expect(gale.droopRad).toBeLessThan(calm.droopRad * 0.25);
    expect(gale.yawRad).toBe(0);
    expect(gale9.yawRad).toBeCloseTo(Math.PI, 6);
    expect(Math.abs(head12.crosswindComponentMps)).toBeLessThan(1e-6);

    const flags = computeWindFlagStates(1000, 6.0);
    expect(flags.length).toBeGreaterThanOrEqual(4);
    expect(flags.every((f) => f.leanRad > 0.8 && f.gustFactor > 0.9)).toBe(
      true
    );
  });

  it('enforces Zero-GC & GPU disposal in Range3DScene and 100% bilingual UI parity in ExternalBallisticsView', () => {
    // Verify Range3DScene Mach-cone GPU disposal & Zero-GC useFrame usage
    const range3dSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/features/ballistics/Range3DScene.tsx'),
      'utf8'
    );
    expect(range3dSrc).toContain('computeMachConeStateInto');
    expect(range3dSrc).toContain('machConeAssets.outerGeo.dispose()');
    expect(range3dSrc).toContain('machConeAssets.lipGeo.dispose()');
    expect(range3dSrc).toContain('machConeAssets.outerMat.dispose()');
    expect(range3dSrc).toContain('machConeAssets.lipMat.dispose()');

    // Verify no `new THREE.*` allocations inside ProjectileVisualMesh or AnimatedWindFlags useFrame bodies
    const projFrameMatch =
      /const ProjectileVisualMesh[\s\S]*?useFrame\(\(\) => \{([\s\S]*?)\n {2}\}\);/.exec(
        range3dSrc
      );
    expect(projFrameMatch).not.toBeNull();
    expect(projFrameMatch![1]).not.toMatch(/\bnew THREE\./);

    const flagFrameMatch =
      /const AnimatedWindFlags[\s\S]*?useFrame\(\(state\) => \{([\s\S]*?)\n {2}\}\);/.exec(
        range3dSrc
      );
    expect(flagFrameMatch).not.toBeNull();
    expect(flagFrameMatch![1]).not.toMatch(/\bnew THREE\./);

    // Bilingual dictionary checks (0 CJK in EN, 0 WP-XX in newly added UI strings)
    const en = EXTERNAL_BALLISTICS_STRINGS.en;
    const zh = EXTERNAL_BALLISTICS_STRINGS.zh;
    expect(Object.keys(en)).toEqual(Object.keys(zh));
    const newEnStrings = [
      en.zeroQuickLabel,
      en.spinDriftToggleLabel,
      en.spinDriftToggleTitle,
      en.spinDriftOn,
      en.spinDriftOff,
      en.stabilityBadgeLabel,
      ...Object.values(en.stabilityStatusLabels),
      ...Object.values(en.twistDirLabels),
      en.spinDriftReadout('+19.3 cm'),
    ];
    for (const s of newEnStrings) {
      expect(s.length).toBeGreaterThan(0);
      expect(CJK_RE.test(s), `EN leaked CJK: ${s}`).toBe(false);
      expect(WP_BADGE_RE.test(s), `EN leaked WP badge: ${s}`).toBe(false);
    }

    // SSR render check across EN (AWM RH, M1911 LH, ZTZ-99A Fin-Stabilized) & ZH
    const prevLang = useAppStore.getState().lang;
    const prevWeapon = useAppStore.getState().activeWeaponId;
    const initialSnap = useAppStore.getInitialState() as { lang: 'zh' | 'en' };
    const prevInitialLang = initialSnap.lang;
    try {
      initialSnap.lang = 'en';
      useAppStore.setState({ lang: 'en', activeWeaponId: 'awm' });
      const htmlAwmEn = renderToStaticMarkup(
        React.createElement(ExternalBallisticsView, {
          initialCaliber: '338_lapua',
        })
      );
      expect(htmlAwmEn).toContain('data-testid="eb-quick-zero-bar"');
      expect(htmlAwmEn).toContain('data-testid="eb-spin-drift-toggle"');
      expect(htmlAwmEn).toContain('data-testid="eb-stability-pill"');
      expect(htmlAwmEn).toContain('Miller Sg');
      expect(htmlAwmEn).toContain('RH Twist');
      expect(htmlAwmEn.replace(/中文/g, '').match(CJK_RE)).toBeNull();

      useAppStore.setState({ lang: 'en', activeWeaponId: 'm1911' });
      const htmlM1911En = renderToStaticMarkup(
        React.createElement(ExternalBallisticsView, {
          initialCaliber: '45_acp',
        })
      );
      expect(htmlM1911En).toContain('LH Twist');
      expect(htmlM1911En.replace(/中文/g, '').match(CJK_RE)).toBeNull();

      useAppStore.setState({ lang: 'en', activeWeaponId: 'ztz99a' });
      const htmlZtzEn = renderToStaticMarkup(
        React.createElement(ExternalBallisticsView, {
          initialCaliber: '125mm_apfsds',
        })
      );
      expect(htmlZtzEn).toContain('Fin-Stabilized');
      expect(htmlZtzEn.replace(/中文/g, '').match(CJK_RE)).toBeNull();

      initialSnap.lang = 'zh';
      useAppStore.setState({ lang: 'zh', activeWeaponId: 'awm' });
      const htmlAwmZh = renderToStaticMarkup(
        React.createElement(ExternalBallisticsView, {
          initialCaliber: '338_lapua',
        })
      );
      expect(htmlAwmZh).toContain('自旋偏流');
      expect(htmlAwmZh).toContain('米勒稳定度 Sg');
    } finally {
      initialSnap.lang = prevInitialLang;
      useAppStore.setState({ lang: prevLang, activeWeaponId: prevWeapon });
    }
  });
});
