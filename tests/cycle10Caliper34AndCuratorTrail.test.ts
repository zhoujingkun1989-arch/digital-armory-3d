import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CALIPER_BENCHMARK_ORDER,
  CALIPER_V2_BENCHMARK_NOTES,
  MM_PER_INCH,
  caliperStore,
  convertMmToInches,
  formatCaliperDistance,
  formatCaliperPlaceholder,
  formatCaliperSignedDelta,
  getCaliperBenchmarkNote,
} from '../src/engine/caliper/caliperStore';
import {
  HistoryTimelineModal,
  TIMELINE_STRINGS,
} from '../src/features/timeline/HistoryTimelineModal';
import { HISTORY_TIMELINE_TOURS } from '../src/features/timeline/historyTimelineSpecs';
import { CaliperHud } from '../src/features/workbench/CaliperHud';
import {
  CuratorTrailBar,
  findCuratorTourById,
} from '../src/features/workbench/CuratorTrailBar';
import { useAppStore } from '../src/store/useAppStore';
import { WEAPON_IDS } from '../src/weapons/types';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const WP_LEAK_RE = /\bWP-\d{2}[a-z]?\b/i;

afterEach(() => {
  caliperStore.setUnitSystem('mm');
  caliperStore.clearPoints();
  useAppStore.getState().setLang('zh');
  useAppStore.getState().resetAll();
  useAppStore.getState().returnToArmory();
});

describe('Cycle 10B — 34/34 3D Vernier Caliper Metrology (mm/in) & Live In-Workbench Curator Tour Navigator', () => {
  it('provides 100% 34/34 exhibit coverage in CALIPER_V2_BENCHMARK_NOTES with 3 positive finite benchmarks each and 0 EN CJK', () => {
    expect(Object.keys(CALIPER_V2_BENCHMARK_NOTES)).toHaveLength(
      WEAPON_IDS.length
    );
    expect(WEAPON_IDS.length).toBe(100);

    for (const weaponId of WEAPON_IDS) {
      const notes = CALIPER_V2_BENCHMARK_NOTES[weaponId];
      expect(notes, `Missing caliper benchmarks for ${weaponId}`).toBeDefined();
      expect(notes).toHaveLength(3);

      const kinds = notes.map((n) => n.kind);
      expect(kinds).toEqual([...CALIPER_BENCHMARK_ORDER]);

      for (const note of notes) {
        expect(Number.isFinite(note.nominalMm)).toBe(true);
        expect(note.nominalMm).toBeGreaterThan(0);
        expect(note.labelZh.trim().length).toBeGreaterThan(0);
        expect(note.labelEn.trim().length).toBeGreaterThan(0);
        expect(
          CJK_RE.test(note.labelEn),
          `CJK leak in EN benchmark for ${weaponId}.${note.kind}`
        ).toBe(false);
        expect(
          WP_LEAK_RE.test(note.labelEn),
          `WP leak in EN benchmark for ${weaponId}.${note.kind}`
        ).toBe(false);
        expect(
          WP_LEAK_RE.test(note.labelZh),
          `WP leak in ZH benchmark for ${weaponId}.${note.kind}`
        ).toBe(false);
      }

      // getCaliperBenchmarkNote resolves every kind cleanly
      for (const kind of CALIPER_BENCHMARK_ORDER) {
        expect(getCaliperBenchmarkNote(weaponId, kind).kind).toBe(kind);
      }
    }
  });

  it('converts mm <-> in accurately (25.4 mm === 1.00 in) and renders live metric/imperial readouts in CaliperHud', () => {
    expect(MM_PER_INCH).toBe(25.4);
    expect(convertMmToInches(25.4)).toBeCloseTo(1.0, 8);
    expect(formatCaliperDistance(25.4, 'mm')).toBe('25.4 mm');
    expect(formatCaliperDistance(25.4, 'in')).toBe('1.00 in');
    expect(formatCaliperDistance(127, 'in')).toBe('5.00 in');
    expect(formatCaliperSignedDelta(-12.7, 'in')).toBe('-0.50 in');
    expect(formatCaliperSignedDelta(2.5, 'mm')).toBe('+2.5 mm');
    expect(formatCaliperPlaceholder('mm')).toBe('---.- mm');
    expect(formatCaliperPlaceholder('in')).toBe('--.-- in');

    // Lock an exact 25.4 mm (2.54 cm world units) measurement along X
    caliperStore.setUnitSystem('mm');
    caliperStore.recordSurfacePoint('m1911', 'm1911_slide', [0, 0, 0]);
    caliperStore.recordSurfacePoint('m1911', 'm1911_barrel', [2.54, 0, 0]);
    expect(caliperStore.getSnapshot().measurement?.distanceMm).toBeCloseTo(
      25.4,
      6
    );

    const htmlMm = renderToStaticMarkup(
      React.createElement(CaliperHud, {
        forceVisible: true,
        weaponIdOverride: 'm1911',
        langOverride: 'en',
      })
    );
    expect(htmlMm).toContain('data-testid="caliper-unit-toggle"');
    expect(htmlMm).toContain('25.4 mm');
    expect(CJK_RE.test(htmlMm)).toBe(false);
    expect(WP_LEAK_RE.test(htmlMm)).toBe(false);

    caliperStore.toggleUnitSystem();
    expect(caliperStore.getUnitSystem()).toBe('in');
    expect(caliperStore.getSnapshot().unitSystem).toBe('in');

    const htmlIn = renderToStaticMarkup(
      React.createElement(CaliperHud, {
        forceVisible: true,
        weaponIdOverride: 'm1911',
        langOverride: 'en',
      })
    );
    expect(htmlIn).toContain('1.00 in');
    expect(htmlIn).toContain('25.4 mm = 1.00 in');
    expect(CJK_RE.test(htmlIn)).toBe(false);
    expect(WP_LEAK_RE.test(htmlIn)).toBe(false);
  });

  it('manages startCuratorTour / exitCuratorTour transitions and renders HistoryTimelineModal CTAs & CuratorTrailBar cleanly', () => {
    expect(useAppStore.getState().activeTourId).toBeNull();

    // Starting a tour closes timeline modal, enters Workbench on requested stop, and sets activeTourId
    useAppStore.getState().openTimelineModal();
    expect(useAppStore.getState().timelineModalOpen).toBe(true);

    useAppStore.getState().startCuratorTour('cold_war_rifles', 'garand');
    expect(useAppStore.getState().activeTourId).toBe('cold_war_rifles');
    expect(useAppStore.getState().timelineModalOpen).toBe(false);
    expect(useAppStore.getState().screen).toBe('workbench');
    expect(useAppStore.getState().activeWeaponId).toBe('garand');

    // Stepping to another exhibit in Workbench preserves the active curator tour
    useAppStore.getState().enterWorkbench('mp5', 'explode');
    expect(useAppStore.getState().activeTourId).toBe('cold_war_rifles');
    expect(useAppStore.getState().activeWeaponId).toBe('mp5');

    // exitCuratorTour, returnToArmory, openShowcase, and resetAll cleanly clear activeTourId
    useAppStore.getState().exitCuratorTour();
    expect(useAppStore.getState().activeTourId).toBeNull();

    useAppStore.getState().startCuratorTour('heavy_armor_evolution', 'tiger1');
    useAppStore.getState().returnToArmory();
    expect(useAppStore.getState().activeTourId).toBeNull();

    useAppStore.getState().startCuratorTour('heavy_armor_evolution', 'ztz99a');
    useAppStore.getState().openShowcase();
    expect(useAppStore.getState().activeTourId).toBeNull();

    useAppStore.getState().startCuratorTour('german_precision', 'p08');
    useAppStore.getState().resetAll();
    expect(useAppStore.getState().activeTourId).toBeNull();

    // CuratorTrailBar renders stop counter, exhibit pills, Prev/Next/Exit controls, and 0 EN CJK / WP-XX
    const tour = findCuratorTourById('cold_war_rifles');
    expect(tour).not.toBeNull();

    const trailEn = renderToStaticMarkup(
      React.createElement(CuratorTrailBar, {
        tourIdOverride: 'cold_war_rifles',
        weaponIdOverride: 'mp5',
        langOverride: 'en',
      })
    );
    expect(trailEn).toContain('data-testid="curator-trail-bar"');
    expect(trailEn).toContain('data-tour-id="cold_war_rifles"');
    expect(trailEn).toContain('2 / 6');
    expect(trailEn).toContain('data-testid="curator-stop-mp5"');
    expect(trailEn).toContain('aria-current="step"');
    expect(trailEn).toContain('data-testid="curator-trail-prev"');
    expect(trailEn).toContain('data-testid="curator-trail-next"');
    expect(trailEn).toContain('data-testid="curator-trail-exit"');
    expect(CJK_RE.test(trailEn)).toBe(false);
    expect(WP_LEAK_RE.test(trailEn)).toBe(false);

    const trailZh = renderToStaticMarkup(
      React.createElement(CuratorTrailBar, {
        tourIdOverride: 'cold_war_rifles',
        weaponIdOverride: 'mp5',
        langOverride: 'zh',
      })
    );
    expect(trailZh).toContain('退出导览');
    expect(WP_LEAK_RE.test(trailZh)).toBe(false);

    // Null tour renders zero markup (zero clutter during normal workbench use)
    const emptyTrail = renderToStaticMarkup(
      React.createElement(CuratorTrailBar, { tourIdOverride: null })
    );
    expect(emptyTrail).toBe('');

    // HistoryTimelineModal exposes 1-click Start Live 3D Tour buttons for every tour + active stepper
    const timelineHtml = renderToStaticMarkup(
      React.createElement(HistoryTimelineModal, {
        onClose: () => {},
        initialTourId: 'cold_war_rifles',
      })
    );
    for (const t of HISTORY_TIMELINE_TOURS) {
      expect(timelineHtml).toContain(`data-testid="timeline-start-tour-${t.id}"`);
    }
    expect(timelineHtml).toContain('data-testid="timeline-stepper-start-live-tour"');
    expect(CJK_RE.test(TIMELINE_STRINGS.en.startLiveTour)).toBe(false);
    expect(CJK_RE.test(TIMELINE_STRINGS.en.startLiveTourCompact)).toBe(false);
    expect(CJK_RE.test(TIMELINE_STRINGS.en.startLiveTourTitle)).toBe(false);
  });

  it('enforces strict lazy chunk isolation for CuratorTrailBar & timeline specs and Blueprint Daylight CSS hygiene', () => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
    expect(appSrc).toContain(
      "lazy(\n  () => import('./features/workbench/CuratorTrailBar')\n)"
    );
    expect(appSrc).toContain('{activeTourId && (');
    expect(appSrc).not.toMatch(/from\s+['"][^'"]*historyTimelineSpecs/);
    expect(appSrc).not.toMatch(/import\s+\{[^}]*CuratorTrailBar[^}]*\}\s+from/);

    const storeSrc = fs.readFileSync(
      path.join(ROOT, 'src/store/useAppStore.ts'),
      'utf8'
    );
    expect(storeSrc).not.toMatch(/from\s+['"][^'"]*historyTimelineSpecs/);

    const wbCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/workbench.css'),
      'utf8'
    );
    expect(wbCss).toContain('.caliper-unit-seg');
    expect(wbCss).toContain('.caliper-benchmark-note');
    expect(wbCss).toContain('.curator-trail-bar');
    expect(wbCss).toContain(":is([data-theme='light'], .theme-light) .curator-trail-bar");
    expect(wbCss).toContain(":is([data-theme='light'], .theme-light) .caliper-unit-seg");
    const openBraces = (wbCss.match(/\{/g) ?? []).length;
    const closeBraces = (wbCss.match(/\}/g) ?? []).length;
    expect(openBraces).toBe(closeBraces);
  });
});
