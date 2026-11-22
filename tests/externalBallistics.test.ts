import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_MAX_RANGES_M,
  ALLOWED_ZERO_RANGES_M,
  BALLISTICS_RANGE_PRESETS,
  buildDopeCardRows,
  computeAtmosphere,
  computeBallisticSolution,
  DEFAULT_DOPE_RANGES_M,
  evaluateDragCoefficient,
  EXTERNAL_PROJECTILE_ORDER,
  EXTERNAL_PROJECTILE_SPECS,
  interpolateTrajectoryAt,
  MOA_PER_RAD,
  MRAD_PER_RAD,
  solveZeroElevationAngleRad,
} from '../src/engine/physics/externalBallistics';
import {
  EXTERNAL_BALLISTICS_STRINGS,
  WAVE2_WEAPON_LABELS,
} from '../src/features/ballistics/externalBallisticsStrings';
import { ExternalBallisticsView } from '../src/features/ballistics/ExternalBallisticsView';
import { useAppStore } from '../src/store/useAppStore';

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

describe('WP-14 · 1,000m RK4 External Ballistics, Wind Drift & Reticle DOPE Lab', () => {
  it('registers all 21 canonical projectile profiles including WP-18 tank cannons (88mm/120mm/125mm), WP-25b (.30-30 Win), WP-17, Wave-2 & 400gr bow/crossbow', () => {
    expect(EXTERNAL_PROJECTILE_ORDER).toHaveLength(21);
    expect(new Set(EXTERNAL_PROJECTILE_ORDER).size).toBe(21);

    const expectedIds = [
      '9mm_para',
      '45_acp',
      '473_caseless',
      '57_28',
      '357_magnum',
      '50_ae',
      '9x39_subsonic',
      '12_gauge',
      '762_m43',
      '545_m74',
      '556_nato',
      '30_30_win',
      '762_nato',
      '30_06',
      '338_lapua',
      '50_bmg',
      'arrow_400gr',
      'bolt_400gr',
      '88mm_pzgr39',
      '120mm_apfsds',
      '125mm_apfsds',
    ] as const;

    for (const id of expectedIds) {
      const spec = EXTERNAL_PROJECTILE_SPECS[id];
      expect(spec).toBeDefined();
      expect(spec.id).toBe(id);
      expect(spec.bc).toBeGreaterThan(0.04);
      expect(spec.muzzleVelocityMps).toBeGreaterThan(100);
      expect(spec.massGrams).toBeGreaterThan(1.5);
      expect(spec.muzzleEnergyJ).toBeGreaterThan(100);
      expect(CJK_RE.test(spec.nameEn)).toBe(false);
      expect(CJK_RE.test(spec.loadLabelEn)).toBe(false);
      expect(CJK_RE.test(spec.noteEn)).toBe(false);
      expect(CJK_RE.test(spec.nameZh) || spec.nameZh.length > 3).toBe(true);
    }

    // Verify Wave-2 .45 ACP 230gr FMJ exact spec
    const acp = EXTERNAL_PROJECTILE_SPECS['45_acp'];
    expect(acp.muzzleVelocityMps).toBe(260);
    expect(acp.massGrams).toBeCloseTo(14.9, 2);
    expect(acp.dragModel).toBe('G1');
    expect(acp.bc).toBeCloseTo(0.195, 3);

    // Verify 12 Gauge 9-pellet 00 Buckshot payload & spread cone
    const buck = EXTERNAL_PROJECTILE_SPECS['12_gauge'];
    expect(buck.pelletCount).toBe(9);
    expect(buck.muzzleEnergyJ).toBeCloseTo(buck.singleMuzzleEnergyJ * 9, 4);

    const buckSol = computeBallisticSolution('12_gauge', {
      maxRangeM: 100,
      zeroRangeM: 25,
    });
    const s25 = interpolateTrajectoryAt(buckSol, 25)!;
    const s50 = interpolateTrajectoryAt(buckSol, 50)!;
    expect(s25.patternSpreadRadiusMm).toBeGreaterThan(200);
    expect(s50.patternSpreadRadiusMm).toBeGreaterThan(
      s25.patternSpreadRadiusMm * 1.8
    );
    expect(s25.energyJ).toBeCloseTo(s25.singlePelletEnergyJ * 9, 4);
  });

  it('computes ICAO standard atmosphere density and speed of sound accurately across altitude & temperature', () => {
    const sea = computeAtmosphere(0, 15);
    expect(sea.airDensityKgM3).toBeCloseTo(1.225, 3);
    expect(sea.pressureHPa).toBeCloseTo(1013.25, 1);
    expect(sea.speedOfSoundMps).toBeCloseTo(
      331.3 * Math.sqrt(1 + 15 / 273.15),
      4
    );

    const cold = computeAtmosphere(0, -20);
    const hot = computeAtmosphere(0, 45);
    expect(cold.speedOfSoundMps).toBeLessThan(sea.speedOfSoundMps);
    expect(hot.speedOfSoundMps).toBeGreaterThan(sea.speedOfSoundMps);
    expect(cold.airDensityKgM3).toBeGreaterThan(hot.airDensityKgM3);

    // High altitude (2,500 m) reduces air density and increases downrange retained velocity & energy
    const highAlt = computeAtmosphere(2500, 15);
    expect(highAlt.airDensityKgM3).toBeLessThan(sea.airDensityKgM3 * 0.78);

    const solSea = computeBallisticSolution('30_06', {
      maxRangeM: 1000,
      zeroRangeM: 100,
      altitudeM: 0,
      tempC: 15,
    });
    const solMountain = computeBallisticSolution('30_06', {
      maxRangeM: 1000,
      zeroRangeM: 100,
      altitudeM: 2500,
      tempC: 15,
    });

    const at1000Sea = interpolateTrajectoryAt(solSea, 1000)!;
    const at1000Mtn = interpolateTrajectoryAt(solMountain, 1000)!;
    expect(at1000Mtn.velocityMps).toBeGreaterThan(at1000Sea.velocityMps + 45);
    expect(at1000Mtn.energyJ).toBeGreaterThan(at1000Sea.energyJ * 1.25);
    // Flatter trajectory (less negative drop) at 2,500 m altitude
    expect(at1000Mtn.dropCm).toBeGreaterThan(at1000Sea.dropCm);
  });

  it('captures G1 and G7 subsonic plateau, sharp transonic wave-drag rise, and supersonic decay', () => {
    for (const model of ['G1', 'G7'] as const) {
      const cdSub = evaluateDragCoefficient(model, 0.6);
      const cdSubEdge = evaluateDragCoefficient(model, 0.82);
      const cdSonic = evaluateDragCoefficient(model, 1.0);
      const cdPeak = evaluateDragCoefficient(
        model,
        model === 'G1' ? 1.32 : 1.12
      );
      const cdSup2 = evaluateDragCoefficient(model, 2.0);
      const cdSup3 = evaluateDragCoefficient(model, 3.0);

      // Subsonic plateau
      expect(Math.abs(cdSubEdge - cdSub)).toBeLessThan(0.03);
      // Sharp transonic wave-drag surge (> 2x subsonic drag)
      expect(cdSonic).toBeGreaterThan(cdSub * 1.75);
      expect(cdPeak).toBeGreaterThan(cdSub * 2.4);
      // Supersonic decay above Mach 1.35
      expect(cdSup2).toBeLessThan(cdPeak);
      expect(cdSup3).toBeLessThan(cdSup2);
    }

    // G7 boat-tail has markedly lower drag coefficient than flat-base G1
    expect(evaluateDragCoefficient('G7', 0.7)).toBeLessThan(
      evaluateDragCoefficient('G1', 0.7) * 0.7
    );
    expect(evaluateDragCoefficient('G7', 2.2)).toBeLessThan(
      evaluateDragCoefficient('G1', 2.2) * 0.65
    );
  });

  it('converges Sight-In Zero Solver to < 0.02 cm solver error and |dropCm(zeroRangeM)| < 0.1 across all 17 profiles', () => {
    for (const id of EXTERNAL_PROJECTILE_ORDER) {
      const isArchery = id === 'arrow_400gr' || id === 'bolt_400gr';
      const testZeros = isArchery ? [25, 50, 100] : ALLOWED_ZERO_RANGES_M;

      for (const zeroM of testZeros) {
        for (const sightCm of [4.8, 6.2]) {
          const { zeroErrorCm } = solveZeroElevationAngleRad(
            id,
            zeroM,
            sightCm
          );
          expect(zeroErrorCm).toBeLessThan(0.02);

          const sol = computeBallisticSolution(id, {
            maxRangeM: Math.max(100, zeroM) as 100 | 300,
            zeroRangeM: zeroM,
            sightHeightCm: sightCm,
          });
          expect(sol.samples[0].dropCm).toBeCloseTo(-sightCm, 4);

          const atZero = interpolateTrajectoryAt(sol, zeroM)!;
          expect(atZero).not.toBeNull();
          expect(Math.abs(atZero.dropCm)).toBeLessThan(0.1);
          expect(Math.abs(atZero.holdoverMil)).toBeLessThan(0.02);
        }
      }
    }
  });

  it('exhibits monotonic velocity & kinetic energy decay and authentic supersonic-to-transonic crossing order', () => {
    // Verify monotonic velocity & energy decay across firearm & sniper calibers out to 1,000m
    const firearmIds = [
      '9mm_para',
      '45_acp',
      '473_caseless',
      '57_28',
      '357_magnum',
      '50_ae',
      '9x39_subsonic',
      '762_m43',
      '545_m74',
      '556_nato',
      '762_nato',
      '30_06',
      '338_lapua',
      '50_bmg',
    ] as const;

    const transonicMap = new Map<string, number | null>();

    for (const id of firearmIds) {
      const sol = computeBallisticSolution(id, {
        maxRangeM: 1000,
        zeroRangeM: 100,
      });
      transonicMap.set(id, sol.transonicRangeM);

      expect(sol.samples.length).toBeGreaterThan(50);
      for (let i = 1; i < sol.samples.length; i++) {
        const prev = sol.samples[i - 1];
        const cur = sol.samples[i];
        expect(cur.rangeM).toBeGreaterThan(prev.rangeM);
        expect(cur.timeOfFlightS).toBeGreaterThan(prev.timeOfFlightS);
        expect(cur.velocityMps).toBeLessThan(prev.velocityMps);
        expect(cur.energyJ).toBeLessThan(prev.energyJ);
      }
    }

    // Subsonic right from the muzzle -> null transonic crossing
    expect(transonicMap.get('45_acp')).toBeNull();
    expect(transonicMap.get('9x39_subsonic')).toBeNull();
    expect(transonicMap.get('473_caseless')).toBeGreaterThan(450);
    expect(transonicMap.get('545_m74')).toBeGreaterThan(550);
    expect(transonicMap.get('762_nato')).toBeGreaterThan(750);
    expect(
      computeBallisticSolution('arrow_400gr', { maxRangeM: 100 })
        .transonicRangeM
    ).toBeNull();
    expect(
      computeBallisticSolution('bolt_400gr', { maxRangeM: 100 }).transonicRangeM
    ).toBeNull();

    // Supersonic-to-transonic crossing ordering:
    // .338 Lapua & .50 BMG (> 1,150 m, supersonic past 1,000 m!) >> .30-06 >> 5.56 NATO > 7.62x39 > 5.7x28 > .50 AE > .357 Mag > 9mm
    const m338 = transonicMap.get('338_lapua')!;
    const m50bmg = transonicMap.get('50_bmg')!;
    const m3006 = transonicMap.get('30_06')!;
    const m556 = transonicMap.get('556_nato')!;
    const m762 = transonicMap.get('762_m43')!;
    const m57 = transonicMap.get('57_28')!;
    const m50ae = transonicMap.get('50_ae')!;
    const m357 = transonicMap.get('357_magnum')!;
    const m9mm = transonicMap.get('9mm_para')!;

    expect(m338).toBeGreaterThan(1150);
    expect(m50bmg).toBeGreaterThan(1100);
    expect(Math.min(m338, m50bmg)).toBeGreaterThan(m3006 + 200);
    expect(m3006).toBeGreaterThan(m556 + 120);
    expect(m556).toBeGreaterThan(m762 + 80);
    expect(m762).toBeGreaterThan(m57 + 80);
    expect(m57).toBeGreaterThan(m50ae + 100);
    expect(m50ae).toBeGreaterThan(m357 + 40);
    expect(m357).toBeGreaterThan(m9mm);

    // Confirm .338 Lapua & .50 BMG are still Mach > 1.0 at 1,000m
    const sol338 = computeBallisticSolution('338_lapua', { maxRangeM: 1000 });
    const sol50 = computeBallisticSolution('50_bmg', { maxRangeM: 1000 });
    expect(interpolateTrajectoryAt(sol338, 1000)!.mach).toBeGreaterThan(1.2);
    expect(interpolateTrajectoryAt(sol50, 1000)!.mach).toBeGreaterThan(1.15);
  });

  it('models crosswind drift with exact zero-wind baseline, odd sign symmetry, linear wind scaling, and quadratic downrange lag growth', () => {
    const solCalm = computeBallisticSolution('556_nato', {
      maxRangeM: 600,
      zeroRangeM: 100,
      crosswindMps: 0,
    });
    for (const s of solCalm.samples) {
      expect(Math.abs(s.windDriftCm)).toBeLessThan(1e-9);
      expect(Math.abs(s.windageMil)).toBeLessThan(1e-9);
    }

    const solPos5 = computeBallisticSolution('556_nato', {
      maxRangeM: 600,
      zeroRangeM: 100,
      crosswindMps: 5,
    });
    const solNeg5 = computeBallisticSolution('556_nato', {
      maxRangeM: 600,
      zeroRangeM: 100,
      crosswindMps: -5,
    });
    const solPos10 = computeBallisticSolution('556_nato', {
      maxRangeM: 600,
      zeroRangeM: 100,
      crosswindMps: 10,
    });

    const d300Pos5 = interpolateTrajectoryAt(solPos5, 300)!.windDriftCm;
    const d600Pos5 = interpolateTrajectoryAt(solPos5, 600)!.windDriftCm;
    const d600Neg5 = interpolateTrajectoryAt(solNeg5, 600)!.windDriftCm;
    const d600Pos10 = interpolateTrajectoryAt(solPos10, 600)!.windDriftCm;

    expect(d600Pos5).toBeGreaterThan(50);
    // Exact opposite sign for -wind
    expect(d600Neg5).toBeCloseTo(-d600Pos5, 5);
    // Linear scaling with crosswind speed
    expect(d600Pos10 / d600Pos5).toBeGreaterThan(1.97);
    expect(d600Pos10 / d600Pos5).toBeLessThan(2.03);
    // Quadratic-like downrange lag growth: drift at 600m is > 3.5x drift at 300m
    expect(d600Pos5 / d300Pos5).toBeGreaterThan(3.5);

    // High-BC .338 Lapua drifts dramatically less at 1,000m than 5.56 NATO in identical wind
    const sol556At1k = computeBallisticSolution('556_nato', {
      maxRangeM: 1000,
      crosswindMps: 5,
    });
    const sol338At1k = computeBallisticSolution('338_lapua', {
      maxRangeM: 1000,
      crosswindMps: 5,
    });
    expect(interpolateTrajectoryAt(sol338At1k, 1000)!.windDriftCm).toBeLessThan(
      interpolateTrajectoryAt(sol556At1k, 1000)!.windDriftCm * 0.45
    );
  });

  it('computes accurate MIL / MOA angular holdovers and 7-row Sniper DOPE Drop Cards', () => {
    const sol = computeBallisticSolution('338_lapua', {
      maxRangeM: 1000,
      zeroRangeM: 100,
      sightHeightCm: 6.2,
      crosswindMps: 4.5,
    });

    const dope = buildDopeCardRows(sol);
    expect(dope.map((r) => r.rangeM)).toEqual([...DEFAULT_DOPE_RANGES_M]);

    const row100 = dope.find((r) => r.rangeM === 100)!;
    expect(Math.abs(row100.dropCm)).toBeLessThan(0.1);
    expect(Math.abs(row100.holdoverMil)).toBeLessThan(0.01);

    const row1000 = dope.find((r) => r.rangeM === 1000)!;
    expect(row1000.inFlight).toBe(true);
    expect(row1000.dropCm).toBeLessThan(-600);
    expect(row1000.holdoverMil).toBeGreaterThan(6.0);
    expect(row1000.holdoverMoa / row1000.holdoverMil).toBeCloseTo(
      MOA_PER_RAD / MRAD_PER_RAD,
      4
    );
  });

  it('enforces 100% zh/en bilingual parity with 0 CJK in English strings and clean ExternalBallisticsView rendering', () => {
    const enCopy = EXTERNAL_BALLISTICS_STRINGS.en;
    const zhCopy = EXTERNAL_BALLISTICS_STRINGS.zh;
    expect(Object.keys(enCopy)).toEqual(Object.keys(zhCopy));

    const enSamples: string[] = [
      enCopy.backBtn,
      enCopy.backTitle,
      enCopy.badge,
      enCopy.title,
      enCopy.subtitle,
      enCopy.dopeJumpBtn,
      enCopy.dopeJumpTitle,
      enCopy.presetsLabel,
      enCopy.projectilesLabel(4, 4),
      enCopy.slotLimitHint,
      enCopy.categoryFilterAria,
      enCopy.categoryLabels.all,
      enCopy.categoryLabels.armor,
      enCopy.categoryLabels.sniper,
      enCopy.categoryLabels.rifle,
      enCopy.categoryLabels.pistol,
      enCopy.categoryLabels.shotgun,
      enCopy.categoryLabels.archery,
      enCopy.armorBadge,
      enCopy.isaReadout('1.225', '100.0', '340.3', '1013.3'),
      enCopy.resetEnvBtn,
      enCopy.resetEnvTitle,
      enCopy.maxRangeLabel,
      enCopy.zeroRangeLabel,
      enCopy.sightHeightLabel,
      enCopy.sightStdShort,
      enCopy.sightHighShort,
      enCopy.sightTankShort,
      enCopy.crosswindLabel,
      enCopy.windLeftToRight,
      enCopy.windRightToLeft,
      enCopy.windDirToggleTitle,
      enCopy.altitudeLabel,
      enCopy.temperatureLabel,
      enCopy.targetScrubLabel,
      enCopy.dropChartBadge,
      enCopy.dropChartTitle,
      enCopy.dropChartSubtitle(100, 6.2),
      enCopy.losLabel,
      enCopy.zeroCrossLabel(100),
      enCopy.machOneShort,
      enCopy.maxOrdShort,
      enCopy.scrubInteractiveHint,
      enCopy.xAxisRangeUnit,
      enCopy.yAxisDropCm,
      enCopy.yAxisDropM,
      enCopy.clampedPlungeHint,
      enCopy.secondaryBadge,
      enCopy.tabWindDrift,
      enCopy.tabVelocity,
      enCopy.tabEnergy,
      enCopy.windChartTitle,
      enCopy.windChartSubtitle('4.5 m/s (+Z)'),
      enCopy.windZeroAxisLabel,
      enCopy.buckshotSpreadLegend,
      enCopy.velocityChartTitle,
      enCopy.velocityChartSubtitle('340.3'),
      enCopy.sonicBarrierLine('340.3'),
      enCopy.transonicZoneLabel,
      enCopy.energyChartTitle,
      enCopy.energyChartSubtitle,
      enCopy.scaleLinear,
      enCopy.scaleSqrt,
      enCopy.reticleBadge,
      enCopy.reticleTitle,
      enCopy.reticleSubtitle(600, '.338 LM'),
      enCopy.illumEtched,
      enCopy.illumRed,
      enCopy.illumCyan,
      enCopy.reticleScaleBadge(12),
      enCopy.elevTurretLabel,
      enCopy.windTurretLabel,
      enCopy.holdUpPrefix,
      enCopy.holdDownPrefix,
      enCopy.holdRightPrefix,
      enCopy.holdLeftPrefix,
      enCopy.buckshotPatternNote(700, '14.0'),
      enCopy.stalledAtRangeNote(520),
      enCopy.telemetryDeckTitle(600),
      enCopy.primaryFocusTag,
      enCopy.setFocusHint,
      enCopy.metricVelMach,
      enCopy.metricDropHold,
      enCopy.metricWindHold,
      enCopy.metricEnergyRetained,
      enCopy.metricTimeOfFlight,
      enCopy.metricTransonicAt,
      enCopy.subsonicMuzzleText,
      enCopy.supersonicBeyondText(1320),
      enCopy.pelletBreakdownText(140, 350),
      enCopy.inspectInWorkbenchTitle('AWM'),
      enCopy.regimeLabels.supersonic,
      enCopy.regimeLabels.transonic,
      enCopy.regimeLabels.subsonic,
      enCopy.dopeBadge,
      enCopy.dopeTitle('.338 Lapua Magnum'),
      enCopy.dopeSubtitle(100, 6.2, '4.5 m/s', 0, 15),
      enCopy.dopeUnitBoth,
      enCopy.dopeUnitMil,
      enCopy.dopeUnitMoa,
      enCopy.dopeClickHint,
      enCopy.colRange,
      enCopy.colDrop,
      enCopy.colElev,
      enCopy.colDrift,
      enCopy.colWind,
      enCopy.colVelocity,
      enCopy.colMach,
      enCopy.colEnergy,
      enCopy.colFlightTime,
      enCopy.colRegime,
      enCopy.zeroBadge,
      enCopy.outOfEnvelopeLabel,
    ];

    for (const s of enSamples) {
      expect(s.length).toBeGreaterThan(0);
      expect(CJK_RE.test(s)).toBe(false);
    }

    for (const preset of BALLISTICS_RANGE_PRESETS) {
      expect(ALLOWED_MAX_RANGES_M).toContain(preset.maxRangeM);
      expect(ALLOWED_ZERO_RANGES_M).toContain(preset.zeroRangeM);
      expect(CJK_RE.test(preset.labelEn)).toBe(false);
      expect(CJK_RE.test(preset.subtitleEn)).toBe(false);
    }

    for (const w of Object.values(WAVE2_WEAPON_LABELS)) {
      expect(CJK_RE.test(w.en)).toBe(false);
    }

    // SSR render check in English & Chinese (verifying SVG charts, FFP reticle, and DOPE table)
    const prevLang = useAppStore.getState().lang;
    const initialSnap = useAppStore.getInitialState() as { lang: 'zh' | 'en' };
    const prevInitialLang = initialSnap.lang;
    try {
      initialSnap.lang = 'en';
      useAppStore.setState({ lang: 'en' });
      const htmlEn = renderToStaticMarkup(
        React.createElement(ExternalBallisticsView, {
          initialCaliber: '338_lapua',
        })
      );
      expect(htmlEn).toContain('Back to Vault');
      expect(htmlEn).toContain('6.2 cm High');
      expect(htmlEn).toContain('152 m/s · ARROW 0.056');
      expect(htmlEn).toContain(
        'Live FFP MIL-Dot / Christmas-Tree Scope Reticle'
      );
      expect(htmlEn).toContain('Quantitative Multi-Range DOPE Drop Card');
      expect(htmlEn).toContain('1000 m');
      // Only the language toggle button label '中文' should contain CJK in English mode
      const strippedLangBtn = htmlEn.replace(/中文/g, '');
      expect(strippedLangBtn.match(CJK_RE)).toBeNull();

      initialSnap.lang = 'zh';
      useAppStore.setState({ lang: 'zh' });
      const htmlZh = renderToStaticMarkup(
        React.createElement(ExternalBallisticsView, {
          initialCaliber: '45_acp',
        })
      );
      expect(htmlZh).toContain('第一像面 MIL 圣诞树光学分划板实况预览');
      expect(htmlZh).toContain('.45 ACP');
    } finally {
      initialSnap.lang = prevInitialLang;
      useAppStore.setState({ lang: prevLang });
    }
  });
});
