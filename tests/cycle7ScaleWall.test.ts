import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScaleWallModal } from '../src/features/scalewall/ScaleWallModal';
import {
  chooseGridTickStepMm,
  computeBarFillPct,
  computeScaleWallLayout,
  formatScaleEnergy,
  formatScaleLength,
  formatScaleMass,
  formatScaleTickLabel,
  getScaleWallExhibit,
  HAND_REFERENCE_MM,
  HUMAN_REFERENCE_MM,
  SCALE_WALL_EXHIBITS,
  SCALE_WALL_GRID_INTERVALS_MM,
  SCALE_WALL_PRESETS,
  SCALE_WALL_STRINGS,
} from '../src/features/scalewall/scaleWallSpecs';
import { WEAPON_IDS } from '../src/weapons/types';

const REPO_ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u4e00-\u9fff]/;
const WP_BADGE_RE = /\bWP-\d+[a-z]?\b/i;

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') {
    try {
      const sample = (value as (...args: unknown[]) => unknown)(50.5, '216 mm', '10.90 m');
      return typeof sample === 'string' ? [sample] : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

describe('Cycle 7A · Smithsonian 1:1 True-Scale Museum Wall Metrology & Layout', () => {
  it('covers all 100 exhibits with realistic millimeter metrology, era years, and >45x Leopard 2A7 / M1911 ratio', () => {
    expect(SCALE_WALL_EXHIBITS).toHaveLength(100);
    const seen = new Set(SCALE_WALL_EXHIBITS.map((e) => e.weaponId));
    expect(seen.size).toBe(100);
    for (const id of WEAPON_IDS) {
      expect(seen.has(id), `Missing ${id} in SCALE_WALL_EXHIBITS`).toBe(true);
    }

    for (const ex of SCALE_WALL_EXHIBITS) {
      expect(ex.oalMm, `${ex.weaponId} oalMm out of range`).toBeGreaterThanOrEqual(
        150
      );
      expect(ex.oalMm, `${ex.weaponId} oalMm out of range`).toBeLessThanOrEqual(
        12000
      );
      expect(ex.massKg, `${ex.weaponId} massKg must be positive`).toBeGreaterThan(
        0.5
      );
      expect(
        ex.muzzleEnergyJ,
        `${ex.weaponId} muzzleEnergyJ must be positive`
      ).toBeGreaterThan(100);
      expect(ex.eraYear).toBeGreaterThanOrEqual(1415);
      expect(ex.eraYear).toBeLessThanOrEqual(2026);
      expect(ex.caliberLabel).not.toMatch(CJK_RE);
      expect(ex.caliberLabelZh.length).toBeGreaterThan(2);
    }

    // Authoritative anchor checks
    expect(getScaleWallExhibit('g17').oalMm).toBe(204);
    expect(getScaleWallExhibit('m1911').oalMm).toBe(216);
    expect(getScaleWallExhibit('p08').oalMm).toBe(222);
    expect(getScaleWallExhibit('ak15').oalMm).toBe(940);
    expect(getScaleWallExhibit('k98k').oalMm).toBe(1110);
    expect(getScaleWallExhibit('mg42').oalMm).toBe(1220);
    expect(getScaleWallExhibit('m82a1').oalMm).toBe(1448);
    expect(getScaleWallExhibit('gau8').oalMm).toBe(6060);
    expect(getScaleWallExhibit('tiger1').oalMm).toBe(8450);
    expect(getScaleWallExhibit('m1a2').oalMm).toBe(9770);
    expect(getScaleWallExhibit('ztz99a').oalMm).toBe(10900);
    expect(getScaleWallExhibit('leopard2a7').oalMm).toBe(10970);

    // >45x scale span between 1:1 MBT and M1911A1
    const leopardToM1911 =
      getScaleWallExhibit('leopard2a7').oalMm /
      getScaleWallExhibit('m1911').oalMm;
    expect(leopardToM1911).toBeGreaterThan(45);
  });

  it('ships 5 curated 1:1 Smithsonian presets with valid weapons, 0 CJK in EN, and 0 WP-XX leaks', () => {
    expect(SCALE_WALL_PRESETS).toHaveLength(5);
    expect(SCALE_WALL_PRESETS.map((p) => p.id)).toEqual([
      'full_spectrum',
      'pistols_micro',
      'wwii_titans',
      'heavy_firepower',
      'cold_war_wonders',
    ]);

    const validIds = new Set<string>(WEAPON_IDS);
    for (const preset of SCALE_WALL_PRESETS) {
      expect(preset.weaponIds.length).toBe(5);
      expect(new Set(preset.weaponIds).size).toBe(5);
      for (const id of preset.weaponIds) {
        expect(validIds.has(id)).toBe(true);
      }
      expect(preset.titleEn).not.toMatch(CJK_RE);
      expect(preset.rangeNoteEn).not.toMatch(CJK_RE);
      expect(preset.titleEn).not.toMatch(WP_BADGE_RE);
      expect(preset.titleZh).not.toMatch(WP_BADGE_RE);
    }
  });

  it('solves strictly proportional 1:1 pixel layouts with Human (1,750 mm) & Hand (190 mm) reference math and calibrated ticks', () => {
    const fullLayout = computeScaleWallLayout(
      ['m1911', 'gau8', 'leopard2a7'],
      1000,
      { reference: 'human' }
    );
    expect(fullLayout.maxExhibitMm).toBe(10970);
    expect(fullLayout.minExhibitMm).toBe(216);
    expect(fullLayout.spanRatio).toBeGreaterThan(45);
    expect(SCALE_WALL_GRID_INTERVALS_MM).toContain(fullLayout.tickStepMm);
    expect(fullLayout.ticks[0].mm).toBe(0);
    expect(fullLayout.ticks[fullLayout.ticks.length - 1].mm).toBe(
      fullLayout.domainMaxMm
    );

    // Exact 1:1 millimeter proportionality
    const m1911Row = fullLayout.rows.find((r) => r.exhibit.weaponId === 'm1911')!;
    const leoRow = fullLayout.rows.find(
      (r) => r.exhibit.weaponId === 'leopard2a7'
    )!;
    expect(leoRow.widthPx / m1911Row.widthPx).toBeCloseTo(10970 / 216, 1);

    // Adult Human 1,750 mm reference
    expect(fullLayout.reference).not.toBeNull();
    expect(fullLayout.reference?.kind).toBe('human');
    expect(fullLayout.reference?.lengthMm).toBe(HUMAN_REFERENCE_MM);
    expect(fullLayout.reference?.widthPx).toBeCloseTo(
      (HUMAN_REFERENCE_MM / fullLayout.domainMaxMm) * 1000,
      1
    );

    // Pistols micro scale with 190 mm Hand reference vs 1,750 mm Human reference
    const pistolHand = computeScaleWallLayout(['g17', 'p08', 'python'], 800, {
      reference: 'hand',
    });
    expect(pistolHand.reference?.lengthMm).toBe(HAND_REFERENCE_MM);
    expect(pistolHand.domainMaxMm).toBeLessThanOrEqual(400);
    expect(chooseGridTickStepMm(292)).toBe(50);

    const pistolHuman = computeScaleWallLayout(['g17', 'p08', 'python'], 800, {
      reference: 'human',
    });
    expect(pistolHuman.domainMaxMm).toBeGreaterThanOrEqual(HUMAN_REFERENCE_MM);
  });

  it('converts lengths, masses, and energies accurately between Metric and Imperial with log/linear bar scaling', () => {
    expect(formatScaleLength(216, 'metric')).toBe('216 mm');
    expect(formatScaleLength(216, 'imperial')).toBe('8.5 in');
    expect(formatScaleLength(10970, 'metric')).toBe('10.97 m (10,970 mm)');
    expect(formatScaleLength(10970, 'imperial')).toBe('36.0 ft (432 in)');

    expect(formatScaleTickLabel(0, 'metric')).toBe('0');
    expect(formatScaleTickLabel(2000, 'metric')).toBe('2 m');
    expect(formatScaleTickLabel(500, 'metric')).toBe('500 mm');
    expect(formatScaleTickLabel(2000, 'imperial')).toContain('ft');

    expect(formatScaleMass(0.625, 'metric', 'en')).toBe('625 g');
    expect(formatScaleMass(55000, 'metric', 'en')).toBe('55.0 t');
    expect(formatScaleMass(55000, 'metric', 'zh')).toBe('55.0 吨');
    expect(formatScaleMass(55000, 'imperial', 'en')).toContain('short tons');
    expect(formatScaleMass(3.5, 'imperial', 'en')).toContain('lb');
    expect(formatScaleMass(55000, 'imperial', 'en')).not.toMatch(CJK_RE);

    expect(formatScaleEnergy(484, 'metric')).toBe('484 J');
    expect(formatScaleEnergy(201470, 'metric')).toBe('201.5 kJ');
    expect(formatScaleEnergy(7604160, 'metric')).toBe('7.60 MJ');
    expect(formatScaleEnergy(484, 'imperial')).toBe('357 ft-lb');
    expect(formatScaleEnergy(7604160, 'imperial')).toContain('M ft-lb');

    // Logarithmic scale keeps 484 J legible next to 7.60 MJ while linear stays strictly proportional
    const logPct = computeBarFillPct(484, 7604160, 'log');
    const linPct = computeBarFillPct(484, 7604160, 'linear');
    expect(logPct).toBeGreaterThan(30);
    expect(linPct).toBeLessThanOrEqual(5);
    expect(computeBarFillPct(7604160, 7604160, 'log')).toBe(100);
    expect(computeBarFillPct(7604160, 7604160, 'linear')).toBe(100);
  });

  it('keeps SCALE_WALL_STRINGS 100% bilingual (0 CJK in EN, 0 WP-XX) and SSR-renders accessible ScaleWallModal with all 34 exhibits', () => {
    expect(Object.keys(SCALE_WALL_STRINGS.en).sort()).toEqual(
      Object.keys(SCALE_WALL_STRINGS.zh).sort()
    );
    for (const txt of collectStrings(SCALE_WALL_STRINGS.en)) {
      expect(txt, `EN string leaked CJK: ${txt}`).not.toMatch(CJK_RE);
      expect(txt, `EN string leaked WP-XX: ${txt}`).not.toMatch(WP_BADGE_RE);
    }
    for (const txt of collectStrings(SCALE_WALL_STRINGS.zh)) {
      expect(txt, `ZH string leaked WP-XX: ${txt}`).not.toMatch(WP_BADGE_RE);
    }

    const html = renderToStaticMarkup(
      React.createElement(ScaleWallModal, {
        initialPresetId: 'full_spectrum',
        onClose: () => {},
      })
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('data-testid="scale-wall-modal"');
    expect(html).toContain('data-testid="scalewall-blueprint-grid"');
    expect(html).toContain('data-testid="scalewall-reference-lane"');
    expect(html).toContain('data-ref-kind="human"');
    expect(html).toContain('data-testid="scalewall-split3d-btn"');
    expect(html).toContain('data-testid="scalewall-metrics-panel"');
    expect(html).toContain('data-testid="scalewall-exhibit-picker"');

    // All 5 presets & all 5 staged full_spectrum lanes rendered
    for (const preset of SCALE_WALL_PRESETS) {
      expect(html).toContain(`data-testid="scalewall-preset-${preset.id}"`);
    }
    for (const id of ['m1911', 'ak15', 'm82a1', 'gau8', 'ztz99a']) {
      expect(html).toContain(`data-testid="scalewall-lane-${id}"`);
      expect(html).toContain(`data-testid="scalewall-inspect-${id}"`);
    }
    // All 34 exhibits available in picker
    for (const id of WEAPON_IDS) {
      expect(html).toContain(`data-testid="scalewall-pick-${id}"`);
    }
    expect(html).not.toMatch(WP_BADGE_RE);

    // Pistols micro preset uses Hand reference by default
    const pistolsHtml = renderToStaticMarkup(
      React.createElement(ScaleWallModal, {
        initialPresetId: 'pistols_micro',
        onClose: () => {},
      })
    );
    expect(pistolsHtml).toContain('data-ref-kind="hand"');

    // Source & CSS hygiene checks
    const modalSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/features/scalewall/ScaleWallModal.tsx'),
      'utf8'
    );
    const cssSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/styles/scale-wall.css'),
      'utf8'
    );
    expect(modalSrc).toContain('useDialogAccessibility');
    expect(cssSrc).toContain("[data-theme='light']");
    expect(cssSrc).toContain('@media (prefers-reduced-motion: reduce)');
    expect(cssSrc).toContain('@media (max-width: 768px)');
    expect(cssSrc).not.toMatch(WP_BADGE_RE);
  });
});
