import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { evaluateCausalityPhysics } from '../src/engine/physics/causalitySandbox';
import CausalitySandboxModal from '../src/features/sandbox/CausalitySandboxModal';
import {
  CAUSALITY_EXPERIMENTS,
  CAUSALITY_SANDBOX_STRINGS,
  computeMechanicalMarginGauges,
  matchActiveCausalityExperiment,
} from '../src/features/sandbox/causalitySandboxStrings';
import {
  assemblePosterMetadata,
  POSTER_DIMENSIONS,
  POSTER_THEMES,
  renderPosterToCanvas,
} from '../src/features/share/posterComposer';
import PosterShareModal from '../src/features/share/PosterShareModal';
import {
  POSTER_SHARE_STRINGS,
  type PosterAspectRatio,
} from '../src/features/share/posterShareStrings';
import HistoryTimelineModal, {
  TIMELINE_STRINGS,
} from '../src/features/timeline/HistoryTimelineModal';
import {
  getTimelineEraCounts,
  HISTORY_TIMELINE_NODES,
  HISTORY_TIMELINE_TOURS,
  matchesTimelineEra,
  TIMELINE_ERAS,
  TIMELINE_LINEAGES,
} from '../src/features/timeline/historyTimelineSpecs';
import { WEAPON_IDS, type WeaponId } from '../src/weapons/types';

const CJK_REGEX = /[\u4e00-\u9fff]/;

function createMockPosterCanvas() {
  const fillTextLabels: string[] = [];
  let fillRectCount = 0;
  let strokeCount = 0;
  const ctx = {
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    quadraticCurveTo: () => undefined,
    arc: () => undefined,
    clip: () => undefined,
    setLineDash: () => undefined,
    fill: () => undefined,
    stroke: () => {
      strokeCount += 1;
    },
    strokeRect: () => {
      strokeCount += 1;
    },
    fillRect: () => {
      fillRectCount += 1;
    },
    drawImage: () => undefined,
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    measureText: (txt: string) => ({ width: txt.length * 7.2 }),
    fillText: (txt: string) => {
      fillTextLabels.push(String(txt));
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  return {
    canvas,
    getStats: () => ({ fillTextLabels, fillRectCount, strokeCount }),
  };
}

describe('Cycle 3F · Causality Sandbox Experiments, History Timeline Era/Tour Stepper, Smithsonian Blueprint Poster & CI Gate', () => {
  it('validates all 4 Ciechanowski Causality Sandbox experiment presets, mechanical margin gauges, and clean SSR', () => {
    expect(CAUSALITY_EXPERIMENTS.length).toBe(4);
    const byId = new Map(CAUSALITY_EXPERIMENTS.map((e) => [e.id, e]));

    const eq = evaluateCausalityPhysics(
      'ak15',
      byId.get('mil_spec_equilibrium')!.params
    );
    expect(eq.status).toBe('nominal');
    expect(eq.strokeRatio).toBeCloseTo(1.0, 3);

    const fte = evaluateCausalityPhysics(
      'm4a1',
      byId.get('subsonic_fte_short_stroke')!.params
    );
    expect(fte.status).toBe('short_stroke_fte');
    expect(fte.strokeRatio).toBeLessThan(0.78);

    const early = evaluateCausalityPhysics(
      'ak15',
      byId.get('overpressure_early_unlock')!.params
    );
    expect(early.status).toBe('overgassed_early_unlock');
    expect(early.chamberPressureAtUnlockMPa).toBeGreaterThan(
      early.safeUnlockPressureMPa * 1.15
    );

    const surge = evaluateCausalityPhysics(
      'm4a1',
      byId.get('suppressed_backpressure_surge')!.params
    );
    expect(['overgassed_early_unlock', 'excessive_bolt_velocity']).toContain(
      surge.status
    );
    expect(surge.modifiedRpm).toBeGreaterThan(surge.baselineRpm * 1.18);

    // Mechanical margin gauges boundaries & tones
    const eqGauges = computeMechanicalMarginGauges(eq);
    expect(eqGauges.map((g) => g.id)).toEqual([
      'chamberSafety',
      'carrierStroke',
      'lockDwell',
    ]);
    expect(eqGauges[0].tone).toBe('nominal');
    expect(eqGauges[1].tone).toBe('nominal');
    expect(eqGauges[1].thresholdPct).toBeCloseTo((78 / 120) * 100, 3);

    const fteGauges = computeMechanicalMarginGauges(fte);
    expect(fteGauges[1].tone).toBe('hazard');
    expect(fteGauges[1].numericValue).toBeLessThan(78);

    const earlyGauges = computeMechanicalMarginGauges(early);
    expect(earlyGauges[0].tone).toBe('hazard');
    expect(earlyGauges[0].numericValue).toBeLessThan(-15);

    for (const exp of CAUSALITY_EXPERIMENTS) {
      expect(matchActiveCausalityExperiment(exp.params)).toBe(exp.id);
    }
    expect(
      matchActiveCausalityExperiment({
        gasPortScale: 1.11,
        recoilSpringKScale: 0.93,
        boltMassScale: 1.07,
        powderLoadScale: 1.01,
      })
    ).toBeNull();

    // Bilingual parity, 0 CJK in EN, zero WP-20 internal badge leak
    expect(CJK_REGEX.test(JSON.stringify(CAUSALITY_SANDBOX_STRINGS.en))).toBe(
      false
    );
    expect(CAUSALITY_SANDBOX_STRINGS.zh.badge).not.toMatch(/WP-20/i);
    expect(CAUSALITY_SANDBOX_STRINGS.en.badge).not.toMatch(/WP-20/i);

    // SSR uses Zustand getInitialState() (default 'zh'); EN strings checked above for 0 CJK
    const html = renderToStaticMarkup(
      React.createElement(CausalitySandboxModal)
    );
    expect(html).toContain('data-experiment-id="mil_spec_equilibrium"');
    expect(html).toContain('data-experiment-id="subsonic_fte_short_stroke"');
    expect(html).toContain('data-experiment-id="overpressure_early_unlock"');
    expect(html).toContain(
      'data-experiment-id="suppressed_backpressure_surge"'
    );
    expect(html).toContain('role="meter"');
    expect(html).toContain('data-gauge-id="chamberSafety"');
    expect(html).toContain('data-gauge-id="carrierStroke"');
    expect(html).toContain('data-gauge-id="lockDwell"');
    expect(html).not.toMatch(/WP-20/i);
  });

  it('partitions all 34 exhibits cleanly across 1894-2026 eras, preserves valid DAG ancestry, and renders Guided Tour Stepper', () => {
    expect(HISTORY_TIMELINE_NODES.length).toBe(WEAPON_IDS.length);
    expect(HISTORY_TIMELINE_NODES.length).toBe(34);

    const nodeById = new Map(HISTORY_TIMELINE_NODES.map((n) => [n.weaponId, n]));
    for (const id of WEAPON_IDS) {
      expect(nodeById.has(id)).toBe(true);
    }

    // Verify chronological DAG validity & V6.0 legend ancestry links
    for (const node of HISTORY_TIMELINE_NODES) {
      for (const ancId of node.ancestors) {
        const anc = nodeById.get(ancId);
        expect(anc).toBeDefined();
        expect(anc!.year).toBeLessThanOrEqual(node.year);
      }
    }
    expect(nodeById.get('g17')?.ancestors).toContain('m1911');
    expect(nodeById.get('mp5')?.ancestors).toContain('mg42');
    expect(nodeById.get('awm')?.ancestors).toContain('k98k');
    expect(nodeById.get('vector')?.ancestors).toContain('thompson');
    expect(nodeById.get('gau8')?.ancestors).toContain('m134');

    // Era partition integrity (sum of 4 eras === 34)
    expect(TIMELINE_ERAS.map((e) => e.id)).toEqual([
      'all',
      'pioneers',
      'wwii_titans',
      'cold_war',
      'modern_armor',
    ]);
    const counts = getTimelineEraCounts();
    expect(counts.all).toBe(34);
    expect(
      counts.pioneers +
        counts.wwii_titans +
        counts.cold_war +
        counts.modern_armor
    ).toBe(34);
    expect(counts.pioneers).toBeGreaterThanOrEqual(3);
    expect(counts.wwii_titans).toBeGreaterThanOrEqual(5);
    expect(matchesTimelineEra(1894, 'pioneers')).toBe(true);
    expect(matchesTimelineEra(1942, 'wwii_titans')).toBe(true);
    expect(matchesTimelineEra(1977, 'cold_war')).toBe(true);
    expect(matchesTimelineEra(2024, 'modern_armor')).toBe(true);

    // 0 CJK in EN era & lineage metadata
    for (const era of TIMELINE_ERAS) {
      expect(CJK_REGEX.test(era.labelEn)).toBe(false);
      expect(CJK_REGEX.test(era.summaryEn)).toBe(false);
    }
    for (const lin of TIMELINE_LINEAGES) {
      expect(CJK_REGEX.test(lin.labelEn)).toBe(false);
    }
    expect(HISTORY_TIMELINE_TOURS.length).toBe(4);
    for (const tour of HISTORY_TIMELINE_TOURS) {
      expect(tour.weaponIds.length).toBeGreaterThanOrEqual(4);
      for (const wid of tour.weaponIds) {
        expect(nodeById.has(wid)).toBe(true);
      }
    }

    // Verify Timeline modal EN strings have 0 CJK & zero WP-24 leak
    expect(CJK_REGEX.test(JSON.stringify(TIMELINE_STRINGS.en))).toBe(false);
    expect(CJK_REGEX.test(TIMELINE_STRINGS.en.tourStopCounter(1, 7))).toBe(
      false
    );
    expect(TIMELINE_STRINGS.en.tourStopCounter(1, 7)).toBe('Stop 1 / 7');
    expect(TIMELINE_STRINGS.zh.badge).not.toMatch(/WP-24/i);
    expect(TIMELINE_STRINGS.en.badge).not.toMatch(/WP-24/i);

    const htmlTour = renderToStaticMarkup(
      React.createElement(HistoryTimelineModal, {
        onClose: () => undefined,
        initialTourId: 'german_precision',
      })
    );
    expect(htmlTour).toContain('data-testid="timeline-era-strip"');
    expect(htmlTour).toContain('data-era-id="pioneers"');
    expect(htmlTour).toContain('data-era-id="wwii_titans"');
    expect(htmlTour).toContain('data-era-id="cold_war"');
    expect(htmlTour).toContain('data-era-id="modern_armor"');
    expect(htmlTour).toContain('data-testid="timeline-tour-stepper"');
    expect(htmlTour).toContain('第 1 / 7 站');
    expect(htmlTour).toContain('timeline-step-launch-btn');
    expect(htmlTour).not.toMatch(/WP-24/i);
  });

  it('renders Smithsonian Exhibition Blueprint poster theme with double-rule frame, scale bar, and Heavy Armor/Ordnance specs', () => {
    expect(POSTER_THEMES.smithsonian_blueprint).toBeDefined();
    expect(POSTER_THEMES.smithsonian_blueprint.bgTop).toBe('#061428');
    expect(POSTER_THEMES.smithsonian_blueprint.accentPrimary).toBe('#e5c158');

    // Bilingual parity & 0 CJK in EN
    expect(Object.keys(POSTER_SHARE_STRINGS.en.themeOptions)).toEqual(
      Object.keys(POSTER_SHARE_STRINGS.zh.themeOptions)
    );
    expect(POSTER_SHARE_STRINGS.en.themeOptions.smithsonian_blueprint.label).toBe(
      'Smithsonian Exhibition Blueprint'
    );
    expect(
      CJK_REGEX.test(JSON.stringify(POSTER_SHARE_STRINGS.en.themeOptions))
    ).toBe(false);

    const activeModes = {
      sectionCut: true,
      xrayShells: false,
      engineeringTint: false,
      explodeProgress: 0.35,
      firingMode: false,
    };

    // 1. MBT Heavy Armor specs (all 4 MBTs)
    const tanks: WeaponId[] = ['ztz99a', 'm1a2', 'leopard2a7', 'tiger1'];
    for (const tankId of tanks) {
      const metaEn = assemblePosterMetadata({
        weaponId: tankId,
        lang: 'en',
        activeModes,
        armorerRank: 'S',
        collectorCallsign: 'SMITHSONIAN-01',
      });
      expect(metaEn.exhibitCategory).toBe('armor');
      expect(metaEn.isHeavyScale).toBe(true);
      expect(metaEn.metrologyCells[0].label).toBe('MAIN CANNON');
      expect(metaEn.metrologyCells[1].label).toBe('MUZZLE ENERGY');
      expect(metaEn.metrologyCells[1].value).toContain('MJ');
      expect(metaEn.metrologyCells[2].label).toBe('OVERALL LENGTH');
      expect(metaEn.metrologyCells[3].label).toBe('COMBAT WEIGHT');
      expect(
        CJK_REGEX.test(
          JSON.stringify([
            metaEn.metrologyCells,
            metaEn.curveTitle,
            metaEn.primaryTitle,
          ])
        )
      ).toBe(false);
    }

    // 2. Heavy Ordnance GAU-8/A specs
    const gau8En = assemblePosterMetadata({
      weaponId: 'gau8',
      lang: 'en',
      activeModes,
      armorerRank: 'A',
      collectorCallsign: 'BRRRT-30MM',
    });
    expect(gau8En.exhibitCategory).toBe('ordnance');
    expect(gau8En.isHeavyScale).toBe(true);
    expect(gau8En.metrologyCells[0].label).toBe('7-BARREL CANNON');
    expect(gau8En.metrologyCells[1].label).toBe('MUZZLE ENERGY');
    expect(gau8En.metrologyCells[2].label).toBe('SYSTEM LENGTH');
    expect(gau8En.metrologyCells[3].label).toBe('LOADED MASS');

    // 3. Render Smithsonian Blueprint canvas across 16:9 and 4:5 for both small arm & heavy armor
    const aspects: PosterAspectRatio[] = ['16:9', '4:5'];
    for (const aspect of aspects) {
      const tankCanvas = createMockPosterCanvas();
      renderPosterToCanvas({
        canvas: tankCanvas.canvas,
        aspect,
        themeId: 'smithsonian_blueprint',
        lang: 'en',
        metadata: assemblePosterMetadata({
          weaponId: 'ztz99a',
          lang: 'en',
          activeModes,
          armorerRank: 'S',
        }),
        viewportImage: null,
      });
      expect(tankCanvas.canvas.width).toBe(POSTER_DIMENSIONS[aspect].width);
      expect(tankCanvas.canvas.height).toBe(POSTER_DIMENSIONS[aspect].height);
      const stats = tankCanvas.getStats();
      expect(
        stats.fillTextLabels.some((lbl) => lbl.includes('ACCESSION'))
      ).toBe(true);
      expect(
        stats.fillTextLabels.some((lbl) => lbl.includes('2000 mm'))
      ).toBe(true);

      const rifleCanvas = createMockPosterCanvas();
      renderPosterToCanvas({
        canvas: rifleCanvas.canvas,
        aspect,
        themeId: 'smithsonian_blueprint',
        lang: 'en',
        metadata: assemblePosterMetadata({
          weaponId: 'ak15',
          lang: 'en',
          activeModes,
        }),
        viewportImage: null,
      });
      expect(
        rifleCanvas.getStats().fillTextLabels.some((lbl) =>
          lbl.includes('200 mm')
        )
      ).toBe(true);
    }

    // 4. PosterShareModal SSR exposes Smithsonian theme & live resolution pill
    const html = renderToStaticMarkup(
      React.createElement(PosterShareModal, {
        open: true,
        weaponId: 'ztz99a',
        armorerRank: 'S',
      })
    );
    expect(html).toContain('swatch-smithsonian_blueprint');
    expect(html).toContain('史密森尼典藏蓝图');
    expect(html).toContain('data-testid="poster-dims-badge"');
    expect(html).toContain('1920');
    expect(html).toContain('1080');
    expect(html).toContain('16:9');
  });

  it('hardens .github/workflows/ci.yml with typecheck, lint, 34-exhibit contract tests, production build, and asset budget audit', () => {
    const ciPath = path.resolve(__dirname, '../.github/workflows/ci.yml');
    const ciYaml = fs.readFileSync(ciPath, 'utf8');
    expect(ciYaml).toContain('npm run typecheck');
    expect(ciYaml).toContain('npm run lint');
    expect(ciYaml).toContain('Vitest full 34-exhibit V6.0 contract suite');
    expect(ciYaml).toContain('npm test');
    expect(ciYaml).toContain('npm run build');
    expect(ciYaml).toContain('npm run assets:audit');
    expect(ciYaml).toContain('34/34 exhibits <= 12 MB');
    expect(ciYaml).toContain('< 1 GB');
  });
});
