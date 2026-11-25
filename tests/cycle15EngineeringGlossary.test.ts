import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ENGINEERING_GLOSSARY_TERMS,
  getGlossaryTermById,
  getGlossaryTermsForWeapon,
} from '../src/engine/encyclopedia/engineeringGlossary';
import { GlossaryTermChips } from '../src/features/workbench/GlossaryTermChips';
import { PartInspectorCard } from '../src/features/workbench/PartInspectorCard';
import { useAppStore } from '../src/store/useAppStore';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';
import { isWeaponId } from '../src/weapons/types';
import { loadWeaponPlugin } from '../src/weapons/registry';

const ROOT = process.cwd();
const CJK_RE = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
const WP_LEAK_RE = /\bWP-\d+[a-z]?\b/i;

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

describe('Cycle 15B — Interactive Smithsonian Engineering Glossary & Cross-Exhibit Discovery', () => {
  afterEach(() => {
    useAppStore.setState({
      screen: 'armory',
      activeWeaponId: 'ak15',
      selectedPartId: null,
      mode: 'explode',
      lang: 'zh',
    });
  });

  it('1. Defines >= 24 unique bilingual engineering principles with valid WeaponIds, 0 CJK in EN & 0 WP-XX leaks', () => {
    expect(ENGINEERING_GLOSSARY_TERMS.length).toBeGreaterThanOrEqual(24);

    const seenIds = new Set<string>();
    for (const term of ENGINEERING_GLOSSARY_TERMS) {
      expect(seenIds.has(term.id), `Duplicate glossary term id ${term.id}`).toBe(
        false
      );
      seenIds.add(term.id);
      expect(getGlossaryTermById(term.id)).toBe(term);

      expect(term.termZh.trim().length).toBeGreaterThan(2);
      expect(term.termEn.trim().length).toBeGreaterThan(4);
      expect(term.summaryZh.trim().length).toBeGreaterThan(20);
      expect(term.summaryEn.trim().length).toBeGreaterThan(40);
      expect(term.relatedWeaponIds.length).toBeGreaterThanOrEqual(2);

      for (const relId of term.relatedWeaponIds) {
        expect(
          isWeaponId(relId),
          `Invalid relatedWeaponId "${relId}" in glossary term ${term.id}`
        ).toBe(true);
      }

      expect(CJK_RE.test(term.termEn), `CJK in termEn (${term.id})`).toBe(false);
      expect(CJK_RE.test(term.summaryEn), `CJK in summaryEn (${term.id})`).toBe(
        false
      );
      expect(WP_LEAK_RE.test(term.termEn)).toBe(false);
      expect(WP_LEAK_RE.test(term.termZh)).toBe(false);
      expect(WP_LEAK_RE.test(term.summaryEn)).toBe(false);
      expect(WP_LEAK_RE.test(term.summaryZh)).toBe(false);
    }
  });

  it('2. Maps ALL 100/100 museum exhibits to 2–4 authentic engineering glossary terms', () => {
    expect(WEAPON_MANIFESTS.length).toBe(100);
    for (const m of WEAPON_MANIFESTS) {
      const terms = getGlossaryTermsForWeapon(m.id);
      expect(
        terms.length,
        `Exhibit ${m.id} must have >= 2 glossary terms`
      ).toBeGreaterThanOrEqual(2);
      expect(terms.length).toBeLessThanOrEqual(4);

      const ids = new Set(terms.map((t) => t.id));
      expect(ids.size).toBe(terms.length);
    }

    // Spot-check signature cross-exhibit engineering connections
    const mg42Terms = getGlossaryTermsForWeapon('mg42');
    expect(mg42Terms[0].id).toBe('roller_locked_short_recoil');
    expect(mg42Terms[0].relatedWeaponIds).toContain('mp5');

    const gau8Terms = getGlossaryTermsForWeapon('gau8');
    expect(gau8Terms[0].id).toBe('hydraulic_rotary_cannon');
    expect(gau8Terms[0].relatedWeaponIds).toContain('m134');

    const ztzTerms = getGlossaryTermsForWeapon('ztz99a');
    expect(ztzTerms.map((t) => t.id)).toContain('carousel_autoloader');
    expect(ztzTerms.map((t) => t.id)).toContain('apfsds_sabot_dart');
  });

  it('3. GlossaryTermChips renders WCAG disclosure with conditional aria-controls and cross-exhibit jumps cleanly in ZH & EN', () => {
    // Closed state omits aria-controls (zero broken_aria_controls) and hides disclosure card
    const closedEn = renderToStaticMarkup(
      React.createElement(GlossaryTermChips, {
        weaponId: 'mg42',
        lang: 'en',
      })
    );
    expect(closedEn).toContain('data-testid="inspector-glossary-block"');
    expect(closedEn).toContain('Engineering Principles');
    expect(closedEn).toContain('data-testid="glossary-chip-roller_locked_short_recoil"');
    expect(closedEn).toContain('aria-expanded="false"');
    expect(closedEn).not.toContain('aria-controls=');
    expect(closedEn).not.toContain('data-testid="glossary-disclosure-card"');
    expect(CJK_RE.test(closedEn)).toBe(false);
    expect(WP_LEAK_RE.test(closedEn)).toBe(false);

    // Expanded state renders disclosure card with matching aria-controls -> id & cross-exhibit MP5 jump
    const openEn = renderToStaticMarkup(
      React.createElement(GlossaryTermChips, {
        weaponId: 'mg42',
        lang: 'en',
        defaultOpenTermId: 'roller_locked_short_recoil',
      })
    );
    const ctrlMatch = openEn.match(/aria-controls="([^"]+)"/);
    expect(ctrlMatch).not.toBeNull();
    expect(openEn).toContain(`id="${ctrlMatch?.[1]}"`);
    expect(openEn).toContain('data-testid="glossary-disclosure-card"');
    expect(openEn).toContain('data-testid="glossary-jump-mp5"');
    expect(openEn).not.toContain('data-testid="glossary-jump-mg42"');
    expect(CJK_RE.test(openEn)).toBe(false);
    expect(WP_LEAK_RE.test(openEn)).toBe(false);

    const openZh = renderToStaticMarkup(
      React.createElement(GlossaryTermChips, {
        weaponId: 'mg42',
        lang: 'zh',
        defaultOpenTermId: 'roller_locked_short_recoil',
      })
    );
    expect(openZh).toContain('机械原理词条');
    expect(openZh).toContain('关联馆藏直达');
    expect(openZh).toContain('data-testid="glossary-jump-mp5"');
    expect(WP_LEAK_RE.test(openZh)).toBe(false);
  });

  it('4. PartInspectorCard integrates GlossaryTermChips cleanly while leaving compact firing card untouched and maintaining Blueprint Daylight + >=34px mobile CSS', async () => {
    const mg42 = await loadWeaponPlugin('mg42');
    const inspectorEn = withSsrLang('en', () =>
      renderToStaticMarkup(
        React.createElement(PartInspectorCard, {
          weaponIdOverride: 'mg42',
          partIdOverride: mg42.parts[0].id,
          modeOverride: 'explode',
          langOverride: 'en',
        })
      )
    );
    expect(inspectorEn).toContain('data-testid="inspector-glossary-block"');
    expect(inspectorEn).toContain('Roller-Locked Short Recoil');
    expect(CJK_RE.test(inspectorEn)).toBe(false);
    expect(WP_LEAK_RE.test(inspectorEn)).toBe(false);

    // Compact firing-phase card stays strictly untouched
    const compactFiring = withSsrLang('en', () =>
      renderToStaticMarkup(
        React.createElement(PartInspectorCard, {
          weaponIdOverride: 'mg42',
          partIdOverride: null,
          modeOverride: 'firing',
          langOverride: 'en',
        })
      )
    );
    expect(compactFiring).toContain('firing-compact-card');
    expect(compactFiring).not.toContain('inspector-glossary-block');

    const wbCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/workbench.css'),
      'utf8'
    );
    expect(wbCss).toContain('.inspector-glossary-block');
    expect(wbCss).toContain('.glossary-term-chip');
    expect(wbCss).toContain('.glossary-disclosure-card');
    expect(wbCss).toContain(
      ":is([data-theme='light'], .theme-light) .inspector-glossary-block"
    );
    expect(wbCss).toMatch(
      /\.glossary-term-chip,\s*\.glossary-related-pill\s*\{[\s\S]*?min-height:\s*34px/
    );
    let open = 0;
    let close = 0;
    for (let i = 0; i < wbCss.length; i++) {
      if (wbCss[i] === '{') open++;
      else if (wbCss[i] === '}') close++;
    }
    expect(open).toBe(close);
  });
});
