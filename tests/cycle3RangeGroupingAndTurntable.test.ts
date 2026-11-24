import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildTurntablePedestalGeometries,
  TURNTABLE_PEDESTAL_PROFILE,
} from '../src/engine/actors/ExhibitionTurntable';
import { computeBallisticSolution } from '../src/engine/physics/externalBallistics';
import { EXTERNAL_BALLISTICS_STRINGS } from '../src/features/ballistics/externalBallisticsStrings';
import { computeSteelGongResonanceProfile } from '../src/features/ballistics/range3DAudio';
import {
  buildRangeTrajectory3D,
  CM_PER_MOA_AT_100M,
  computeFiveRoundGrouping,
  getProjectileDispersionProfile,
  GROUPING_STRING_SHOT_COUNT,
} from '../src/features/ballistics/range3DMath';
import { Range3DScene } from '../src/features/ballistics/Range3DScene';
import {
  buildTargetCardSummary,
  renderRangeTargetCardCanvas,
  TARGET_CARD_HEIGHT,
  TARGET_CARD_WIDTH,
} from '../src/features/ballistics/targetCardExporter';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function createMockCanvas2d(): {
  ctx: CanvasRenderingContext2D;
  texts: string[];
  state: { dashCalls: number };
} {
  const texts: string[] = [];
  const state = { dashCalls: 0 };
  const noop = () => {};
  const gradStub = { addColorStop: noop };
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    globalAlpha: 1,
    lineCap: 'butt',
    createLinearGradient: () => gradStub,
    createRadialGradient: () => gradStub,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    setLineDash: () => {
      state.dashCalls += 1;
    },
    fillText: (text: string) => {
      texts.push(String(text));
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, texts, state };
}

describe('Cycle 3B · 5-Round Proving Ground Grouping, Target Card PNG, Gong Resonance & Turntable Craft', () => {
  it('1. Computes deterministic 5-round ballistic grouping across .338 LM, 30x173mm GAU-8, 7.62x39mm & 125mm APFSDS with monotonic distance scaling', () => {
    const calibers = [
      '125mm_apfsds',
      '338_lapua',
      '762_m43',
      '30x173_gau8',
    ] as const;

    const esMoaAt600: Record<string, number> = {};

    for (const cal of calibers) {
      const sol = computeBallisticSolution(cal, {
        maxRangeM: 1000,
        zeroRangeM: 100,
        crosswindMps: 4.5,
      });
      const traj600 = buildRangeTrajectory3D(sol, 600, 'dope_dial', 'steel_gong');

      // Reproducible deterministic seed
      const gA = computeFiveRoundGrouping(traj600, 424242);
      const gB = computeFiveRoundGrouping(traj600, 424242);
      expect(gA).toEqual(gB);
      expect(gA.shotCount).toBe(GROUPING_STRING_SHOT_COUNT);
      expect(gA.shots).toHaveLength(5);
      expect(gA.hitCount).toBeGreaterThanOrEqual(0);
      expect(gA.hitCount).toBeLessThanOrEqual(5);

      // Exact Extreme Spread & Mean Radius algebraic verification
      let maxPair = 0;
      for (let i = 0; i < gA.shots.length; i++) {
        for (let j = i + 1; j < gA.shots.length; j++) {
          const d = Math.hypot(
            gA.shots[i].offsetZCm - gA.shots[j].offsetZCm,
            gA.shots[i].offsetYCm - gA.shots[j].offsetYCm
          );
          if (d > maxPair) maxPair = d;
        }
      }
      expect(gA.extremeSpreadCm).toBeCloseTo(maxPair, 6);

      const expectedMoa =
        gA.extremeSpreadCm / ((600 / 100) * CM_PER_MOA_AT_100M);
      expect(gA.extremeSpreadMoa).toBeCloseTo(expectedMoa, 6);

      const meanZ =
        gA.shots.reduce((acc, s) => acc + s.offsetZCm, 0) / gA.shots.length;
      const meanY =
        gA.shots.reduce((acc, s) => acc + s.offsetYCm, 0) / gA.shots.length;
      expect(gA.groupCenterOffsetCm.x).toBeCloseTo(meanZ, 6);
      expect(gA.groupCenterOffsetCm.y).toBeCloseTo(meanY, 6);

      const expectedMr =
        gA.shots.reduce(
          (acc, s) =>
            acc + Math.hypot(s.offsetZCm - meanZ, s.offsetYCm - meanY),
          0
        ) / gA.shots.length;
      expect(gA.meanRadiusCm).toBeCloseTo(expectedMr, 6);
      expect(gA.cep50Cm).toBeGreaterThan(0);
      expect(Number.isFinite(gA.cep50Cm)).toBe(true);
      expect(gA.totalStringTimelineS).toBeGreaterThan(traj600.totalTimelineS);

      esMoaAt600[cal] = gA.extremeSpreadMoa;

      // Monotonic linear/superlinear physical distance scaling (100m < 300m < 600m < 1000m)
      const distances = [100, 300, 600, 1000] as const;
      const spreads = distances.map((d) => {
        const t = buildRangeTrajectory3D(sol, d, 'dope_dial', 'steel_gong');
        return computeFiveRoundGrouping(t, 424242);
      });
      for (let k = 1; k < spreads.length; k++) {
        expect(spreads[k].extremeSpreadCm).toBeGreaterThan(
          spreads[k - 1].extremeSpreadCm
        );
        expect(spreads[k].cep50Cm).toBeGreaterThan(spreads[k - 1].cep50Cm);
        expect(spreads[k].meanRadiusCm).toBeGreaterThan(
          spreads[k - 1].meanRadiusCm
        );
      }
    }

    // Authentic precision hierarchy across platforms
    expect(
      getProjectileDispersionProfile(
        computeBallisticSolution('125mm_apfsds').spec
      ).moaBase
    ).toBeCloseTo(0.38, 2);
    expect(
      getProjectileDispersionProfile(
        computeBallisticSolution('338_lapua').spec
      ).moaBase
    ).toBeCloseTo(0.55, 2);
    expect(
      getProjectileDispersionProfile(
        computeBallisticSolution('30x173_gau8').spec
      ).moaBase
    ).toBeGreaterThanOrEqual(15);
    expect(esMoaAt600['125mm_apfsds']).toBeLessThan(esMoaAt600['762_m43']);
    expect(esMoaAt600['338_lapua']).toBeLessThan(esMoaAt600['762_m43']);
    expect(esMoaAt600['30x173_gau8']).toBeGreaterThan(
      esMoaAt600['762_m43'] * 3
    );
  });

  it('2. Renders 1200x800 bilingual PNG Range Target Card with zero CJK leaks in EN and valid plotted metrics', () => {
    const sol = computeBallisticSolution('338_lapua', {
      maxRangeM: 1000,
      zeroRangeM: 100,
      crosswindMps: 5.0,
    });
    const traj = buildRangeTrajectory3D(sol, 800, 'dope_dial', 'steel_gong');
    const grouping = computeFiveRoundGrouping(traj, 104729);

    expect(TARGET_CARD_WIDTH).toBe(1200);
    expect(TARGET_CARD_HEIGHT).toBe(800);

    for (const lang of ['en', 'zh'] as const) {
      const input = {
        grouping,
        traj,
        lang,
        signedCrosswindMps: 5.0,
        elevDialMil: traj.elevDialRad * 1000,
        windDialMil: traj.windDialRad * 1000,
      };
      const summary = buildTargetCardSummary(input);
      expect(summary.width).toBe(1200);
      expect(summary.height).toBe(800);
      expect(summary.filename).toMatch(/^digital-armory-target-card-338_lapua-800m\.png$/);
      expect(summary.metrics).toHaveLength(9);

      const mock = createMockCanvas2d();
      renderRangeTargetCardCanvas(mock.ctx, input);
      // Dashed CEP50 & Extreme Spread circles must both be stroked
      expect(mock.state.dashCalls).toBeGreaterThanOrEqual(2);
      // All 5 shot sequence numbers (1..5) plotted cleanly
      for (const n of ['1', '2', '3', '4', '5']) {
        expect(mock.texts).toContain(n);
      }

      if (lang === 'en') {
        expect(CJK_RE.test(summary.headerKicker)).toBe(false);
        expect(CJK_RE.test(summary.headerTitle)).toBe(false);
        expect(CJK_RE.test(summary.caliberSubtitle)).toBe(false);
        expect(CJK_RE.test(summary.plateLegend)).toBe(false);
        expect(CJK_RE.test(summary.footerNote)).toBe(false);
        for (const row of summary.metrics) {
          expect(CJK_RE.test(row.label)).toBe(false);
          expect(CJK_RE.test(row.value)).toBe(false);
        }
        for (const drawn of mock.texts) {
          expect(CJK_RE.test(drawn)).toBe(false);
        }
      }
    }
  });

  it('3. Models center-vs-edge AR500 steel gong resonance harmonics & bilingual 5-Rd String UI cleanly', () => {
    const center = computeSteelGongResonanceProfile(0.0, false);
    const mid = computeSteelGongResonanceProfile(0.5, false);
    const edge = computeSteelGongResonanceProfile(0.96, false);

    // Center bullseye rings stronger fundamental & longer decay than edge strikes
    expect(center.fundamentalGain).toBeGreaterThan(mid.fundamentalGain);
    expect(mid.fundamentalGain).toBeGreaterThan(edge.fundamentalGain);
    expect(center.decayMultiplier).toBeGreaterThan(mid.decayMultiplier);
    expect(mid.decayMultiplier).toBeGreaterThan(edge.decayMultiplier);
    // Edge strikes sound higher-pitched with crisper edge overtones & higher splash HPF
    expect(edge.pitchRatio).toBeGreaterThan(center.pitchRatio);
    expect(edge.edgeOvertoneBoost).toBeGreaterThan(center.edgeOvertoneBoost);
    expect(edge.splashHighpassHz).toBeGreaterThan(center.splashHighpassHz);

    // Anti-clipping compressor bus present in range3DAudio.ts
    const audioSrc = readRepoFile('src/features/ballistics/range3DAudio.ts');
    expect(audioSrc).toContain('createDynamicsCompressor');

    // Bilingual string parity & zero CJK in EN
    expect(Object.keys(EXTERNAL_BALLISTICS_STRINGS.en)).toEqual(
      Object.keys(EXTERNAL_BALLISTICS_STRINGS.zh)
    );
    const newEnKeys = [
      EXTERNAL_BALLISTICS_STRINGS.en.range3dString5Btn,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dString5Title,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dClearMarksBtn,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dClearMarksTitle,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dScorecardTitle,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dMetricEs,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dMetricMr,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dMetricCep50,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dMetricHits,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dMetricMpi,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dDownloadCardBtn,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dDownloadCardTitle,
    ];
    for (const str of newEnKeys) {
      expect(str.length).toBeGreaterThan(0);
      expect(CJK_RE.test(str)).toBe(false);
    }

    // SSR render includes 5-Rd String trigger in EN & ZH
    const sol = computeBallisticSolution('338_lapua', { maxRangeM: 1000 });
    const htmlEn = renderToStaticMarkup(
      React.createElement(Range3DScene, {
        focusedSolution: sol,
        comparisonSolutions: [sol],
        slotColors: ['#38bdf8'],
        maxRangeM: 1000,
        targetRangeM: 600,
        signedCrosswindMps: 4.5,
        lang: 'en',
        isLightTheme: false,
      })
    );
    expect(htmlEn).toContain('range3d-string5-btn');
    expect(htmlEn).toContain('5-Rd String');
    expect(CJK_RE.test(htmlEn)).toBe(false);

    const htmlZh = renderToStaticMarkup(
      React.createElement(Range3DScene, {
        focusedSolution: sol,
        comparisonSolutions: [sol],
        slotColors: ['#38bdf8'],
        maxRangeM: 1000,
        targetRangeM: 600,
        signedCrosswindMps: 4.5,
        lang: 'zh',
        isLightTheme: false,
      })
    );
    expect(htmlZh).toContain('5 发连射散布');
  });

  it('4. Polishes ExhibitionTurntable with beveled collar, scan tick ring, grounding shadow, linear lock & zero new THREE in useFrame', () => {
    for (const r of [36, 460]) {
      const geos = buildTurntablePedestalGeometries(r);
      try {
        const expectedTotalH =
          TURNTABLE_PEDESTAL_PROFILE.totalHeight * (r > 100 ? 15 : 1);
        for (const geo of [
          geos.outerBevelRing,
          geos.scanTickRing,
          geos.groundShadowDisc,
        ]) {
          const pos = geo.getAttribute('position');
          expect(pos.count).toBeGreaterThan(24);
          for (let i = 0; i < pos.count; i++) {
            expect(Number.isFinite(pos.getX(i))).toBe(true);
            expect(Number.isFinite(pos.getY(i))).toBe(true);
            expect(Number.isFinite(pos.getZ(i))).toBe(true);
          }
          geo.computeBoundingBox();
        }
        // Ground shadow disc rests cleanly right above the turntable floor datum (`+0.004 * hScale`)
        const hScale = r > 100 ? 15 : 1;
        expect(geos.groundShadowDisc.boundingBox!.min.y).toBeCloseTo(
          -expectedTotalH + 0.004 * hScale,
          2
        );
      } finally {
        geos.platter.dispose();
        geos.chassis.dispose();
        geos.accentGroove.dispose();
        geos.dial.dispose();
        geos.insert.dispose();
        geos.statusRing.dispose();
        geos.indexNotch.dispose();
        geos.outerBevelRing.dispose();
        geos.scanTickRing.dispose();
        geos.groundShadowDisc.dispose();
      }
    }

    const src = readRepoFile('src/engine/actors/ExhibitionTurntable.tsx');
    // Verify R3F v8 linear-colorSpace lock and complete GPU cleanup
    expect(src).toContain('createBrushedBevelRoughnessTexture');
    expect(src).toContain('lockLinearTextureColorSpace(tex)');
    expect(src).toContain('bevelRoughTex?.dispose()');
    expect(src).toContain('scanArcTex?.dispose()');
    expect(src).toContain('groundShadowTex?.dispose()');
    expect(src).toContain('geos.outerBevelRing.dispose()');
    expect(src).toContain('geos.scanTickRing.dispose()');
    expect(src).toContain('geos.groundShadowDisc.dispose()');

    // Enforce zero `new THREE.` heap allocations inside `useFrame` body
    const useFrameIdx = src.indexOf('useFrame(');
    expect(useFrameIdx).toBeGreaterThan(-1);
    const useFrameEnd = src.indexOf('});', useFrameIdx);
    const useFrameBody = src.slice(useFrameIdx, useFrameEnd);
    expect(useFrameBody).not.toMatch(/\bnew\s+THREE\./);
  });
});
