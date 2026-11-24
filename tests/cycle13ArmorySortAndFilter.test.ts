import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ArmoryView } from '../src/features/armory/ArmoryView';
import {
  ARMORY_MECHANISM_FILTERS,
  ARMORY_SORT_FILTER_STRINGS,
  ARMORY_SORT_KEYS,
  EXHIBIT_DESIGN_YEAR,
  EXHIBIT_MECHANISM_TAGS,
  formatArmorySortChipMetric,
  getArmoryExhibitSortMetrics,
  parseCyclicRateRpm,
  parseOverallLengthMm,
  sortAndFilterArmoryWeapons,
} from '../src/features/armory/armorySortFilter';
import { HISTORY_TIMELINE_NODES } from '../src/features/timeline/historyTimelineSpecs';
import { useAppStore } from '../src/store/useAppStore';
import { ARMORY_WEAPONS, WEAPON_MANIFESTS } from '../src/weapons/manifests';

const ROOT = process.cwd();
const CJK_RE = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
const WP_LEAK_RE = /\bWP-\d+[a-z]?\b/i;

function stripLangSwitchPill(html: string): string {
  return html.replace(/<div class="lang-switch-pill[\s\S]*?<\/div>/g, '');
}

function withSsrLang<T>(lang: 'zh' | 'en', fn: () => T): T {
  const initialState = useAppStore.getInitialState() as { lang: 'zh' | 'en' };
  const prevInitialLang = initialState.lang;
  const prevStateLang = useAppStore.getState().lang;
  initialState.lang = lang;
  useAppStore.setState({ lang });
  try {
    return fn();
  } finally {
    initialState.lang = prevInitialLang;
    useAppStore.setState({ lang: prevStateLang });
  }
}

describe('Cycle 13A — Armory Vault Inline Sort & Operating-Mechanism Filter Strip', () => {
  afterEach(() => {
    useAppStore.setState({
      screen: 'armory',
      activeWeaponId: 'ak15',
      lang: 'zh',
    });
  });

  it('1. Sorts all 34 exhibits accurately across all 5 sort modes without mutating source array', () => {
    const snapshotIds = ARMORY_WEAPONS.map((w) => w.id);

    // Curatorial preserves canonical manifest order
    const curatorial = sortAndFilterArmoryWeapons(
      ARMORY_WEAPONS,
      'curatorial',
      'all'
    );
    expect(curatorial.map((w) => w.id)).toEqual(snapshotIds);
    expect(curatorial).not.toBe(ARMORY_WEAPONS);

    // Chronological 1894 -> 2024 starts with Winchester M1894 and syncs 1:1 with HistoryTimeline
    const byYear = sortAndFilterArmoryWeapons(ARMORY_WEAPONS, 'year_asc', 'all');
    expect(byYear).toHaveLength(WEAPON_MANIFESTS.length);
    expect(byYear[0].id).toBe('winchester1894');
    expect(EXHIBIT_DESIGN_YEAR.winchester1894).toBe(1894);
    for (let i = 1; i < byYear.length; i++) {
      expect(
        getArmoryExhibitSortMetrics(byYear[i].id).year
      ).toBeGreaterThanOrEqual(
        getArmoryExhibitSortMetrics(byYear[i - 1].id).year
      );
    }
    const timelineYearMap = new Map(
      HISTORY_TIMELINE_NODES.map((n) => [n.weaponId, n.year])
    );
    for (const m of WEAPON_MANIFESTS) {
      expect(EXHIBIT_DESIGN_YEAR[m.id]).toBe(timelineYearMap.get(m.id));
    }

    // Muzzle kinetic energy descending: 125mm/120mm MBTs -> .50 BMG -> 9mm
    const byEnergy = sortAndFilterArmoryWeapons(
      ARMORY_WEAPONS,
      'energy_desc',
      'all'
    );
    expect(byEnergy).toHaveLength(WEAPON_MANIFESTS.length);
    const eIdx = (id: string) => byEnergy.findIndex((w) => w.id === id);
    expect(eIdx('ztz99a')).toBe(0);
    expect(eIdx('leopard2a7')).toBeLessThan(eIdx('m82a1'));
    expect(eIdx('m1a2')).toBeLessThan(eIdx('m82a1'));
    expect(eIdx('gau8')).toBeLessThan(eIdx('m82a1'));
    expect(eIdx('m82a1')).toBeLessThan(eIdx('g17'));
    expect(eIdx('g17')).toBeLessThan(eIdx('lift33'));
    for (let i = 1; i < byEnergy.length; i++) {
      expect(
        getArmoryExhibitSortMetrics(byEnergy[i - 1].id).energyJ
      ).toBeGreaterThanOrEqual(
        getArmoryExhibitSortMetrics(byEnergy[i].id).energyJ
      );
    }

    // Physical 1:1 length descending: Leopard 2A7 / ZTZ-99A -> GAU-8/A -> G17
    const byLength = sortAndFilterArmoryWeapons(
      ARMORY_WEAPONS,
      'length_desc',
      'all'
    );
    const lIdx = (id: string) => byLength.findIndex((w) => w.id === id);
    expect(byLength[0].id).toBe('leopard2a7');
    expect(byLength[1].id).toBe('ztz99a');
    expect(lIdx('ztz99a')).toBeLessThan(lIdx('gau8'));
    expect(lIdx('gau8')).toBeLessThan(lIdx('m82a1'));
    expect(lIdx('m82a1')).toBeLessThan(lIdx('g17'));
    for (let i = 1; i < byLength.length; i++) {
      expect(
        getArmoryExhibitSortMetrics(byLength[i - 1].id).lengthMm
      ).toBeGreaterThanOrEqual(
        getArmoryExhibitSortMetrics(byLength[i].id).lengthMm
      );
    }

    // Cyclic rate descending: GAU-8/A & M134D ahead of AN-94 ahead of K98k
    const byRpm = sortAndFilterArmoryWeapons(ARMORY_WEAPONS, 'rpm_desc', 'all');
    const rIdx = (id: string) => byRpm.findIndex((w) => w.id === id);
    expect(rIdx('gau8')).toBeLessThan(rIdx('an94'));
    expect(rIdx('m134')).toBeLessThan(rIdx('an94'));
    expect(rIdx('an94')).toBeLessThan(rIdx('k98k'));
    expect(rIdx('mg42')).toBeLessThan(rIdx('k98k'));
    expect(getArmoryExhibitSortMetrics('lift33').cyclicRateRpm).toBe(0);
    expect(getArmoryExhibitSortMetrics('r500').cyclicRateRpm).toBe(0);
    for (let i = 1; i < byRpm.length; i++) {
      expect(
        getArmoryExhibitSortMetrics(byRpm[i - 1].id).cyclicRateRpm
      ).toBeGreaterThanOrEqual(
        getArmoryExhibitSortMetrics(byRpm[i].id).cyclicRateRpm
      );
    }

    // Source catalog remained untouched
    expect(ARMORY_WEAPONS.map((w) => w.id)).toEqual(snapshotIds);
  });

  it('2. Parses length & cyclic-rate strings accurately and covers all 34 exhibits across mechanism filters', () => {
    expect(parseOverallLengthMm('880–940 mm (折叠 690 mm)')).toBe(940);
    expect(parseOverallLengthMm('10,970 mm (含6.6m炮管) / 7,700 mm (车体)')).toBe(
      10970
    );
    expect(parseOverallLengthMm('6,060 mm (全系统含螺旋弹鼓) / 2,850 mm (机炮本体)')).toBe(
      6060
    );
    expect(parseCyclicRateRpm('3,900 发/分 (65 发/秒 · 双液压驱动)')).toBe(3900);
    expect(parseCyclicRateRpm('1,200–1,500 rpm (纯全自动开膛)')).toBe(1500);
    expect(parseCyclicRateRpm('70 lb 拉力 · 85% 省力')).toBe(0);
    expect(parseCyclicRateRpm('6发转轮 · 双动/单动')).toBe(0);

    const covered = new Set<string>();
    for (const mech of ARMORY_MECHANISM_FILTERS) {
      const matched = sortAndFilterArmoryWeapons(
        ARMORY_WEAPONS,
        'curatorial',
        mech
      );
      expect(matched.length, `Filter ${mech} must be non-empty`).toBeGreaterThan(
        0
      );
      if (mech !== 'all') {
        for (const item of matched) covered.add(item.id);
      }
    }
    expect(covered.size).toBe(WEAPON_MANIFESTS.length);

    // Spot-check canonical mechanism memberships
    const idsFor = (mech: (typeof ARMORY_MECHANISM_FILTERS)[number]) =>
      sortAndFilterArmoryWeapons(ARMORY_WEAPONS, 'curatorial', mech).map(
        (w) => w.id
      );
    expect(idsFor('rotating_bolt')).toEqual(
      expect.arrayContaining(['ak15', 'm4a1', 'scar', 'garand', 'an94'])
    );
    expect(idsFor('short_recoil')).toEqual(
      expect.arrayContaining(['m1911', 'g17', 'p08', 'p320', 'm82a1', 'mg42'])
    );
    expect(idsFor('roller_delay')).toEqual(
      expect.arrayContaining(['mp5', 'mg42', 'vector', 'thompson', 'p90'])
    );
    expect(idsFor('manual_action')).toEqual(
      expect.arrayContaining(['k98k', 'awm', 'winchester1894', 'rem870', 'python'])
    );
    expect(idsFor('rotary_cannon')).toEqual(['m134', 'gau8']);
    expect(idsFor('smoothbore_armor')).toEqual([
      'ztz99a',
      'm1a2',
      'leopard2a7',
      'tiger1',
    ]);
    expect(idsFor('compound_archery')).toEqual(['lift33', 'r500']);
    expect(Object.keys(EXHIBIT_MECHANISM_TAGS)).toHaveLength(
      WEAPON_MANIFESTS.length
    );
  });

  it('3. Formats concise rack metric chips and enforces 100% zh/en parity with 0 CJK in EN & 0 WP-XX', () => {
    // Key parity
    expect(Object.keys(ARMORY_SORT_FILTER_STRINGS.en)).toEqual(
      Object.keys(ARMORY_SORT_FILTER_STRINGS.zh)
    );
    expect(Object.keys(ARMORY_SORT_FILTER_STRINGS.en.sortOptions)).toEqual([
      ...ARMORY_SORT_KEYS,
    ]);
    expect(Object.keys(ARMORY_SORT_FILTER_STRINGS.en.mechOptions)).toEqual([
      ...ARMORY_MECHANISM_FILTERS,
    ]);

    // 0 CJK & 0 WP-XX across EN dictionary
    const enFlat = JSON.stringify(ARMORY_SORT_FILTER_STRINGS.en);
    const zhFlat = JSON.stringify(ARMORY_SORT_FILTER_STRINGS.zh);
    expect(CJK_RE.test(enFlat)).toBe(false);
    expect(WP_LEAK_RE.test(enFlat)).toBe(false);
    expect(WP_LEAK_RE.test(zhFlat)).toBe(false);

    const winchester = ARMORY_WEAPONS.find((w) => w.id === 'winchester1894')!;
    const ztz99a = ARMORY_WEAPONS.find((w) => w.id === 'ztz99a')!;
    const gau8 = ARMORY_WEAPONS.find((w) => w.id === 'gau8')!;

    expect(formatArmorySortChipMetric(gau8, 'curatorial', 'en')).toBeNull();
    expect(formatArmorySortChipMetric(winchester, 'year_asc', 'en')).toBe(
      '1894'
    );
    expect(formatArmorySortChipMetric(ztz99a, 'energy_desc', 'en')).toBe(
      '7.60 MJ'
    );
    expect(formatArmorySortChipMetric(gau8, 'length_desc', 'en')).toBe(
      '6,060 mm'
    );
    expect(formatArmorySortChipMetric(gau8, 'rpm_desc', 'en')).toBe('3,900 RPM');

    for (const item of ARMORY_WEAPONS) {
      for (const sortKey of ARMORY_SORT_KEYS) {
        const badgeEn = formatArmorySortChipMetric(item, sortKey, 'en');
        const badgeZh = formatArmorySortChipMetric(item, sortKey, 'zh');
        if (sortKey === 'curatorial') {
          expect(badgeEn).toBeNull();
          expect(badgeZh).toBeNull();
        } else {
          expect(badgeEn).toBeTruthy();
          expect(badgeZh).toBeTruthy();
          expect(CJK_RE.test(badgeEn ?? '')).toBe(false);
          expect(WP_LEAK_RE.test(badgeEn ?? '')).toBe(false);
          expect(WP_LEAK_RE.test(badgeZh ?? '')).toBe(false);
        }
      }
    }
  });

  it('4. Renders rack-deck sort/filter selects, active metric chips, empty-state reset & Blueprint Daylight CSS cleanly', () => {
    // Default curatorial render (EN): controls live inside rack deck, header untouched, 0 CJK
    const defaultEn = withSsrLang('en', () =>
      renderToStaticMarkup(
        React.createElement(ArmoryView, {
          weaponIdOverride: 'ak15',
          langOverride: 'en',
        })
      )
    );
    expect(defaultEn).toContain('data-testid="armory-rack-sort-filter"');
    expect(defaultEn).toContain('data-testid="armory-sort-select"');
    expect(defaultEn).toContain('data-testid="armory-mech-select"');
    expect(defaultEn).not.toContain('data-testid="wcard-sort-metric"');
    expect(defaultEn).not.toContain('data-testid="armory-rack-reset-btn"');
    expect(defaultEn).toContain('3D Vault');
    expect(CJK_RE.test(stripLangSwitchPill(defaultEn))).toBe(false);
    expect(WP_LEAK_RE.test(defaultEn)).toBe(false);

    // Chronological sort render shows live metric chips & 1-click Reset button, putting Winchester 1894 first
    const yearEn = withSsrLang('en', () =>
      renderToStaticMarkup(
        React.createElement(ArmoryView, {
          weaponIdOverride: 'ak15',
          langOverride: 'en',
          initialSortKey: 'year_asc',
        })
      )
    );
    expect(yearEn).toContain('data-testid="wcard-sort-metric">1894</span>');
    expect(yearEn).toContain('data-testid="armory-rack-reset-btn"');
    const rackGridEn = yearEn.slice(yearEn.indexOf('class="armory-cards-grid"'));
    expect(rackGridEn.indexOf('BAY-28')).toBeLessThan(
      rackGridEn.indexOf('BAY-01')
    );
    expect(CJK_RE.test(stripLangSwitchPill(yearEn))).toBe(false);

    // Graceful empty intersection renders 0 / 34 counter & 1-click reset CTA
    const emptyEn = withSsrLang('en', () =>
      renderToStaticMarkup(
        React.createElement(ArmoryView, {
          weaponIdOverride: 'lift33',
          langOverride: 'en',
          initialCategory: 'archery',
          initialMechanismFilter: 'rotary_cannon',
        })
      )
    );
    expect(emptyEn).toContain('0 / 34');
    expect(emptyEn).toContain('data-testid="armory-rack-empty"');
    expect(emptyEn).toContain('data-testid="armory-empty-reset-btn"');
    expect(CJK_RE.test(stripLangSwitchPill(emptyEn))).toBe(false);

    // CSS contracts: Blueprint Daylight parity, mobile <= 768px zero-overflow & balanced braces
    const armoryCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/armory.css'),
      'utf8'
    );
    expect(armoryCss).toContain('.rack-sort-filter-bar');
    expect(armoryCss).toContain('.rack-control-select');
    expect(armoryCss).toContain('.wcard-sort-metric-pill');
    expect(armoryCss).toContain(
      ":is([data-theme='light'], .theme-light) .rack-control-select"
    );
    expect(armoryCss).toContain(
      ":is([data-theme='light'], .theme-light) .wcard-sort-metric-pill"
    );
    expect(armoryCss).toContain('@media (max-width: 768px)');
    expect(armoryCss).toContain('@media (prefers-reduced-motion: reduce)');
    let open = 0;
    let close = 0;
    for (let i = 0; i < armoryCss.length; i++) {
      if (armoryCss[i] === '{') open++;
      else if (armoryCss[i] === '}') close++;
    }
    expect(open).toBe(close);
  });
});
