import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ENGINEERING_GLOSSARY_TERMS } from '../src/engine/encyclopedia/engineeringGlossary';
import {
  HistoryTimelineModal,
  TIMELINE_STRINGS,
  filterEngineeringGlossaryTerms,
} from '../src/features/timeline/HistoryTimelineModal';
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
} from '../src/features/workbench/commandPaletteEngine';
import { useAppStore } from '../src/store/useAppStore';

const ROOT = process.cwd();
const CJK_RE = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
const WP_LEAK_RE = /\bWP-\d+[a-z]?\b/i;
const NOOP = () => {};

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

describe('Cycle 16B — Cmd+K 28-Term Glossary Search & HistoryTimelineModal Engineering Encyclopedia Tab', () => {
  afterEach(() => {
    useAppStore.setState({
      screen: 'armory',
      activeWeaponId: 'ak15',
      mode: 'explode',
      lang: 'zh',
    });
  });

  it('1. Indexes all 28 ENGINEERING_GLOSSARY_TERMS in Cmd+K with bilingual search & flagship Workbench execution', () => {
    useAppStore.setState({ lang: 'en', activeWeaponId: 'ak15' });
    const itemsEn = buildCommandPaletteItems({
      state: useAppStore.getState(),
      activeWeaponParts: [],
    });
    const principlesEn = itemsEn.filter((i) => i.group === 'principles');
    expect(principlesEn).toHaveLength(ENGINEERING_GLOSSARY_TERMS.length);

    for (const p of principlesEn) {
      expect(CJK_RE.test(p.title), `CJK in EN title ${p.id}`).toBe(false);
      expect(CJK_RE.test(p.subtitle), `CJK in EN subtitle ${p.id}`).toBe(false);
      expect(CJK_RE.test(p.codeBadge ?? '')).toBe(false);
      expect(CJK_RE.test(p.statusBadge ?? '')).toBe(false);
      expect(WP_LEAK_RE.test(p.title)).toBe(false);
      expect(WP_LEAK_RE.test(p.subtitle)).toBe(false);
    }

    // Verify canonical EN queries surface exact principles + flagship exhibits
    const blishHits = filterCommandPaletteItems(itemsEn, 'blish', 'en')
      .flatItems.filter((i) => i.group === 'principles');
    expect(blishHits.some((i) => i.id === 'principle:blish_bronze_wedge')).toBe(
      true
    );
    expect(
      blishHits.find((i) => i.id === 'principle:blish_bronze_wedge')?.weaponId
    ).toBe('thompson');

    const sabotHits = filterCommandPaletteItems(itemsEn, 'sabot', 'en')
      .flatItems.filter((i) => i.group === 'principles');
    expect(sabotHits.some((i) => i.id === 'principle:apfsds_sabot_dart')).toBe(
      true
    );
    expect(['ztz99a', 'm1a2', 'leopard2a7']).toContain(
      sabotHits.find((i) => i.id === 'principle:apfsds_sabot_dart')?.weaponId
    );

    const polyHits = filterCommandPaletteItems(itemsEn, 'polygonal', 'en')
      .flatItems.filter((i) => i.group === 'principles');
    expect(
      polyHits.some((i) => i.id === 'principle:polygonal_vs_cut_rifling')
    ).toBe(true);

    const argoHits = filterCommandPaletteItems(itemsEn, 'ARGO', 'en')
      .flatItems.filter((i) => i.group === 'principles');
    expect(argoHits.some((i) => i.id === 'principle:argo_dual_piston')).toBe(
      true
    );
    expect(
      argoHits.find((i) => i.id === 'principle:argo_dual_piston')?.weaponId
    ).toBe('benellim4');

    const hyperHits = filterCommandPaletteItems(itemsEn, 'hyperburst', 'en')
      .flatItems.filter((i) => i.group === 'principles');
    expect(hyperHits.some((i) => i.id === 'principle:pulley_hyperburst')).toBe(
      true
    );

    // Executing a principle item jumps cleanly into its flagship exhibit in Workbench
    const blishItem = blishHits.find(
      (i) => i.id === 'principle:blish_bronze_wedge'
    )!;
    blishItem.execute();
    expect(useAppStore.getState().screen).toBe('workbench');
    expect(useAppStore.getState().activeWeaponId).toBe('thompson');
    expect(useAppStore.getState().mode).toBe('explode');

    // Verify ZH queries ("滚柱", "布利什", "尾翼") match cleanly too
    useAppStore.setState({ lang: 'zh' });
    const itemsZh = buildCommandPaletteItems({
      state: useAppStore.getState(),
      activeWeaponParts: [],
    });
    const rollerZh = filterCommandPaletteItems(itemsZh, '滚柱', 'zh')
      .flatItems.filter((i) => i.group === 'principles');
    expect(rollerZh.map((i) => i.id)).toEqual(
      expect.arrayContaining([
        'principle:roller_delayed_blowback',
        'principle:roller_locked_short_recoil',
      ])
    );

    const blishZh = filterCommandPaletteItems(itemsZh, '布利什', 'zh')
      .flatItems.filter((i) => i.group === 'principles');
    expect(blishZh.some((i) => i.id === 'principle:blish_bronze_wedge')).toBe(
      true
    );

    const sabotZh = filterCommandPaletteItems(itemsZh, '尾翼', 'zh')
      .flatItems.filter((i) => i.group === 'principles');
    expect(sabotZh.some((i) => i.id === 'principle:apfsds_sabot_dart')).toBe(
      true
    );
  });

  it('2. filterEngineeringGlossaryTerms supports bilingual title, summary, and exhibit matching', () => {
    expect(filterEngineeringGlossaryTerms('')).toHaveLength(
      ENGINEERING_GLOSSARY_TERMS.length
    );
    expect(
      filterEngineeringGlossaryTerms('blish').some(
        (t) => t.id === 'blish_bronze_wedge'
      )
    ).toBe(true);
    expect(
      filterEngineeringGlossaryTerms('滚柱').map((t) => t.id)
    ).toEqual(
      expect.arrayContaining([
        'roller_delayed_blowback',
        'roller_locked_short_recoil',
      ])
    );
    expect(
      filterEngineeringGlossaryTerms('GAU-8').some(
        (t) => t.id === 'hydraulic_rotary_cannon'
      )
    ).toBe(true);
    expect(filterEngineeringGlossaryTerms('nonexistent-xyz-999')).toHaveLength(
      0
    );
  });

  it('3. HistoryTimelineModal renders searchable 28-term Glossary tab with explicit aria-label, 0 CJK in EN & Blueprint Daylight CSS', () => {
    // Check TIMELINE_STRINGS EN zero-CJK & zero-WP
    expect(CJK_RE.test(JSON.stringify(TIMELINE_STRINGS.en))).toBe(false);
    expect(WP_LEAK_RE.test(JSON.stringify(TIMELINE_STRINGS.en))).toBe(false);
    expect(WP_LEAK_RE.test(JSON.stringify(TIMELINE_STRINGS.zh))).toBe(false);

    // Full Glossary tab render (EN) lists all 28 cards + explicit aria-label on search input
    const htmlEn = withSsrLang('en', () =>
      renderToStaticMarkup(
        React.createElement(HistoryTimelineModal, {
          onClose: NOOP,
          initialTab: 'glossary',
        })
      )
    );
    expect(htmlEn).toContain('data-testid="timeline-modal-tabs"');
    expect(htmlEn).toContain('data-testid="timeline-tab-glossary"');
    expect(htmlEn).toContain('data-testid="timeline-glossary-panel"');
    expect(htmlEn).toContain('data-testid="timeline-glossary-search"');
    expect(htmlEn).toMatch(/<input[^>]*aria-label="Search 28 mechanical/);
    const cardMatches = htmlEn.match(/data-testid="encyclopedia-term-/g) ?? [];
    expect(cardMatches).toHaveLength(ENGINEERING_GLOSSARY_TERMS.length);
    expect(htmlEn).toContain('data-testid="encyclopedia-jump-blish_bronze_wedge-thompson"');
    expect(CJK_RE.test(htmlEn)).toBe(false);
    expect(WP_LEAK_RE.test(htmlEn)).toBe(false);

    // Filtered Glossary query renders matching subset
    const filteredEn = withSsrLang('en', () =>
      renderToStaticMarkup(
        React.createElement(HistoryTimelineModal, {
          onClose: NOOP,
          initialTab: 'glossary',
          initialGlossaryQuery: 'roller',
        })
      )
    );
    expect(filteredEn).toContain(
      'data-testid="encyclopedia-term-roller_delayed_blowback"'
    );
    expect(filteredEn).toContain(
      'data-testid="encyclopedia-term-roller_locked_short_recoil"'
    );
    expect(CJK_RE.test(filteredEn)).toBe(false);

    // CSS contracts: 2-col desktop, 1fr mobile, >=34px mobile touch targets, Blueprint Daylight & balanced braces
    const css = fs.readFileSync(
      path.join(ROOT, 'src/styles/timeline-museum.css'),
      'utf8'
    );
    expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(css).toMatch(
      /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.timeline-glossary-grid\s*\{\s*grid-template-columns:\s*1fr/
    );
    expect(css).toContain(
      ":is([data-theme='light'], .theme-light, body.studio-light-ui)\n  .timeline-glossary-card"
    );
    let open = 0;
    let close = 0;
    for (let i = 0; i < css.length; i++) {
      if (css[i] === '{') open++;
      else if (css[i] === '}') close++;
    }
    expect(open).toBe(close);
  });

  it('4. Keeps HistoryTimelineModal strictly lazy-loaded (not eagerly preloaded in index.html)', () => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
    expect(appSrc).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(['"].*HistoryTimelineModal['"]\)/);

    const distIndexPath = path.join(ROOT, 'dist/index.html');
    if (fs.existsSync(distIndexPath)) {
      const distIndex = fs.readFileSync(distIndexPath, 'utf8');
      expect(distIndex).not.toContain('HistoryTimelineModal');
    }
  });
});
