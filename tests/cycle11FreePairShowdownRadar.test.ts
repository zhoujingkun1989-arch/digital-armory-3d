import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WEAPON_RIFLING_SPECS } from '../src/engine/ballistics/riflingSpecs';
import { MechanismShowdownModal } from '../src/features/armory/MechanismShowdownModal';
import {
  SHOWDOWN_RADAR_AXES,
  buildShowdownRadarGeometry,
  computeWeaponRadarMetrics,
  getClassicRivalryPresets,
  resolveFreePairSelection,
  resolveFreePairSwap,
} from '../src/features/armory/mechanismShowdownSpecs';
import { useAppStore } from '../src/store/useAppStore';
import { WEAPON_IDS } from '../src/weapons/types';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const WP_LEAK_RE = /\bWP-\d{2}[a-z]?\b/i;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

describe('Cycle 11C — Free-Pair 34×33 Mechanism Showdown Custom Duel Builder & 6-Axis Engineering Radar', () => {
  it('computes finite clamped [0..100] 6-axis radar metrics across all 100 exhibits with physically accurate ordering', () => {
    expect(WEAPON_IDS).toHaveLength(100);
    expect(SHOWDOWN_RADAR_AXES).toHaveLength(6);

    const byId = new Map(
      WEAPON_IDS.map((id) => [id, computeWeaponRadarMetrics(id)])
    );

    for (const id of WEAPON_IDS) {
      const m = byId.get(id)!;
      for (const axis of SHOWDOWN_RADAR_AXES) {
        const val = m[axis.id];
        expect(Number.isFinite(val), `${id}.${axis.id} not finite`).toBe(true);
        expect(val, `${id}.${axis.id} < 0`).toBeGreaterThanOrEqual(0);
        expect(val, `${id}.${axis.id} > 100`).toBeLessThanOrEqual(100);
      }
      expect(m.raw.velocityMps).toBeGreaterThan(0);
      expect(m.raw.energyJ).toBeGreaterThan(0);
      expect(m.raw.effectiveRpm).toBeGreaterThan(0);
      expect(m.raw.overallLengthMm).toBeGreaterThan(0);
      expect(m.raw.partsCount).toBeGreaterThan(0);
      expect(m.raw.effectiveRangeM).toBeGreaterThan(0);
      expect(m.raw.emptyWeightKg).toBeGreaterThan(0);
    }

    // Physical monotonicity invariants
    expect(byId.get('ztz99a')!.energy).toBeGreaterThan(
      byId.get('m82a1')!.energy
    );
    expect(byId.get('m82a1')!.energy).toBeGreaterThan(byId.get('g17')!.energy);

    expect(byId.get('g17')!.compactness).toBeGreaterThan(
      byId.get('p90')!.compactness
    );
    expect(byId.get('p90')!.compactness).toBeGreaterThan(
      byId.get('m4a1')!.compactness
    );
    expect(byId.get('m4a1')!.compactness).toBeGreaterThan(
      byId.get('leopard2a7')!.compactness
    );

    expect(byId.get('gau8')!.cyclicRate).toBeGreaterThan(
      byId.get('m134')!.cyclicRate
    );
    expect(byId.get('m134')!.cyclicRate).toBeGreaterThan(
      byId.get('mg42')!.cyclicRate
    );
    expect(byId.get('mg42')!.cyclicRate).toBeGreaterThan(
      byId.get('k98k')!.cyclicRate
    );

    expect(byId.get('ztz99a')!.velocity).toBeGreaterThan(
      byId.get('m4a1')!.velocity
    );
    expect(byId.get('m4a1')!.velocity).toBeGreaterThan(
      byId.get('g17')!.velocity
    );
    expect(byId.get('g17')!.velocity).toBeGreaterThan(
      byId.get('lift33')!.velocity
    );

    expect(byId.get('m1a2')!.rangeReach).toBeGreaterThan(
      byId.get('m82a1')!.rangeReach
    );
    expect(byId.get('m82a1')!.rangeReach).toBeGreaterThan(
      byId.get('ak15')!.rangeReach
    );
    expect(byId.get('ak15')!.rangeReach).toBeGreaterThan(
      byId.get('g17')!.rangeReach
    );

    // Radar geometry builder produces 4 hexagonal rings + 6 vertices + closed polygons
    const geo = buildShowdownRadarGeometry(
      byId.get('tiger1')!,
      byId.get('m1a2')!
    );
    expect(geo.ringPolygons).toHaveLength(4);
    expect(geo.vertices).toHaveLength(6);
    expect(geo.polygonA.split(' ')).toHaveLength(6);
    expect(geo.polygonB.split(' ')).toHaveLength(6);
  });

  it('supports arbitrary 34×33 free-pair custom duels with swap and renders 6-axis Radar SVG & Rifling/Scale parity with 0 EN CJK / WP-XX', () => {
    // Pure swap & anti-self-duel selection across all 34 exhibits
    expect(resolveFreePairSwap('tiger1', 'm1a2')).toEqual(['m1a2', 'tiger1']);
    expect(resolveFreePairSelection('A', 'm1a2', 'tiger1', 'm1a2')).toEqual([
      'm1a2',
      'tiger1',
    ]);
    expect(resolveFreePairSelection('B', 'tiger1', 'tiger1', 'm1a2')).toEqual([
      'm1a2',
      'tiger1',
    ]);
    for (const id of WEAPON_IDS) {
      const [a, b] = resolveFreePairSelection('A', id, 'ak15', 'm4a1');
      expect(a).not.toBe(b);
    }

    // All 30+ curated iconic presets remain intact
    expect(getClassicRivalryPresets('en').length).toBeGreaterThanOrEqual(30);

    // Render arbitrary cross-era duels in English & Chinese
    const testPairs = [
      ['tiger1', 'm1a2'],
      ['gau8', 'm134'],
      ['p08', 'm1911'],
      ['lift33', 'r500'],
      ['an94', 'g11'],
    ] as const;

    const initialSnap = useAppStore.getInitialState() as { lang: 'zh' | 'en' };
    const prevInitialLang = initialSnap.lang;
    const prevLang = useAppStore.getState().lang;

    try {
      initialSnap.lang = 'en';
      useAppStore.setState({ lang: 'en' });

      for (const [wA, wB] of testPairs) {
        const htmlEn = renderToStaticMarkup(
          React.createElement(MechanismShowdownModal, {
            initialMode: 'showdown',
            initialWeaponA: wA,
            initialWeaponB: wB,
            langOverride: 'en',
            onClose: () => {},
          })
        );

        // Custom 34-exhibit A & B selectors + Swap + 3D Split CTA
        expect(htmlEn).toContain('data-testid="sd-custom-duel-bar"');
        expect(htmlEn).toContain('data-testid="sd-custom-select-a"');
        expect(htmlEn).toContain('data-testid="sd-custom-select-b"');
        expect(htmlEn).toContain('data-testid="sd-custom-swap-btn"');
        expect(htmlEn).toContain('data-testid="sd-staging-split3d-cta"');
        expect(htmlEn).toContain('data-testid="sd-active-split3d-cta"');

        // Both selects contain all 100 exhibit options
        const selectAMatch = htmlEn.match(
          /data-testid="sd-custom-select-a"[\s\S]*?<\/select>/
        );
        const selectBMatch = htmlEn.match(
          /data-testid="sd-custom-select-b"[\s\S]*?<\/select>/
        );
        expect(selectAMatch).not.toBeNull();
        expect(selectBMatch).not.toBeNull();
        expect((selectAMatch![0].match(/<option\b/g) ?? []).length).toBe(100);
        expect((selectBMatch![0].match(/<option\b/g) ?? []).length).toBe(100);

        // Live 6-Axis Radar SVG & interactive axis rows
        expect(htmlEn).toContain('data-testid="sd-radar-card"');
        expect(htmlEn).toContain('data-testid="sd-radar-svg"');
        expect(htmlEn).toContain('role="img"');
        expect(htmlEn).toContain('data-testid="sd-radar-axis-table"');
        for (const axis of SHOWDOWN_RADAR_AXES) {
          expect(htmlEn).toContain(`data-radar-axis="${axis.id}"`);
          expect(CJK_RE.test(axis.labelEn)).toBe(false);
          expect(CJK_RE.test(axis.shortEn)).toBe(false);
        }

        // Bore & Rifling + 1:1 Scale & Mass Parity Strip
        expect(htmlEn).toContain('data-testid="sd-rifling-scale-strip"');
        const rifA = WEAPON_RIFLING_SPECS[wA];
        if (rifA.kind !== 'none') {
          expect(htmlEn).toContain(escapeHtml(rifA.labelEn));
        } else {
          expect(htmlEn).toContain('Non-Barreled');
        }

        // Zero CJK leaks in English (excluding LanguageSwitchPill's intentional '中文' button)
        const strippedEn = htmlEn.replace(/中文/g, '');
        expect(
          CJK_RE.test(strippedEn),
          `CJK leak in EN Showdown (${wA} vs ${wB}): ${strippedEn.match(/.{0,24}[\u3400-\u9fff]+.{0,24}/)?.[0] ?? ''}`
        ).toBe(false);
        expect(WP_LEAK_RE.test(htmlEn)).toBe(false);
      }
    } finally {
      initialSnap.lang = prevInitialLang;
      useAppStore.setState({ lang: prevLang });
    }

    // Chinese mode renders cleanly with 0 WP-XX leaks
    const htmlZh = renderToStaticMarkup(
      React.createElement(MechanismShowdownModal, {
        initialMode: 'showdown',
        initialWeaponA: 'gau8',
        initialWeaponB: 'm134',
        langOverride: 'zh',
        onClose: () => {},
      })
    );
    expect(htmlZh).toContain('100×99 自由对决');
    expect(htmlZh).toContain('六维定量工程雷达图');
    expect(WP_LEAK_RE.test(htmlZh)).toBe(false);
  });

  it('enforces bundle hygiene (0 lazy/circular imports in mechanismShowdownSpecs) and Blueprint Daylight + mobile CSS integrity', () => {
    const specsSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/armory/mechanismShowdownSpecs.ts'),
      'utf8'
    );
    expect(specsSrc).not.toMatch(/from\s+['"][^'"]*recoilPhysics/);
    expect(specsSrc).not.toMatch(/from\s+['"][^'"]*RecoilLabModal/);
    expect(specsSrc).not.toMatch(/from\s+['"][^'"]*ScaleWallModal/);
    expect(specsSrc).not.toMatch(/from\s+['"][^'"]*riflingSpecs/);

    const modalSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/armory/MechanismShowdownModal.tsx'),
      'utf8'
    );
    expect(WP_LEAK_RE.test(modalSrc)).toBe(false);

    const cssSrc = fs.readFileSync(
      path.join(ROOT, 'src/styles/showdown.css'),
      'utf8'
    );
    expect(WP_LEAK_RE.test(cssSrc)).toBe(false);
    expect(cssSrc).toContain('.sd-custom-duel-bar');
    expect(cssSrc).toContain('.sd-radar-section');
    expect(cssSrc).toContain('.sd-rifling-scale-strip');
    expect(cssSrc).toContain(":is([data-theme='light'], .theme-light) .sd-radar-section");
    expect(cssSrc).toContain('@media (max-width: 768px)');
    expect(cssSrc).toContain('@media (prefers-reduced-motion: reduce)');
    const openBraces = (cssSrc.match(/\{/g) ?? []).length;
    const closeBraces = (cssSrc.match(/\}/g) ?? []).length;
    expect(openBraces).toBe(closeBraces);
  });
});
