import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ENGINEERING_GLOSSARY_TERMS } from '../src/engine/encyclopedia/engineeringGlossary';
import { ShowcaseView } from '../src/features/showcase/ShowcaseView';
import { SHOWCASE_STRINGS } from '../src/i18n/showcaseStrings';
import { useAppStore } from '../src/store/useAppStore';
import {
  MUSEUM_BALLISTICS_PROFILE_COUNT,
  MUSEUM_CARTRIDGE_LAB_TOTAL_COUNT,
  MUSEUM_EXHIBIT_COUNT,
  MUSEUM_HALL_COUNT,
  MUSEUM_PBR_WEBP_COUNT,
  MUSEUM_TOTAL_PARTS,
} from '../src/weapons/museumMetrics';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const WP_LEAK_RE = /\bWP-\d{2}[a-z]?\b/i;

function collectLeafStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (typeof node === 'function') {
    const sample = (node as (...args: unknown[]) => unknown)('AK-15', 24);
    if (typeof sample === 'string') out.push(sample);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectLeafStrings(item, out);
    return out;
  }
  if (node && typeof node === 'object') {
    for (const val of Object.values(node)) {
      collectLeafStrings(val, out);
    }
  }
  return out;
}

describe('Cycle 21A — World-Class Showcase Landing Modernization & Live Certifications', () => {
  const prevLang = useAppStore.getState().lang;

  afterEach(() => {
    useAppStore.getState().setLang(prevLang);
  });

  it('imports SSOT museumMetrics cleanly and aligns all Showcase copy counts with live registries', () => {
    const stringsSrc = fs.readFileSync(
      path.join(ROOT, 'src/i18n/showcaseStrings.ts'),
      'utf8'
    );
    expect(stringsSrc).toContain("from '../weapons/museumMetrics'");
    expect(stringsSrc).toContain('MUSEUM_EXHIBIT_COUNT');
    expect(stringsSrc).toContain('MUSEUM_TOTAL_PARTS');
    expect(stringsSrc).toContain('MUSEUM_HALL_COUNT');
    expect(stringsSrc).toContain('MUSEUM_PBR_WEBP_COUNT');
    expect(stringsSrc).toContain('MUSEUM_VERSION');

    const enJoined = collectLeafStrings(SHOWCASE_STRINGS.en).join('\n');
    const zhJoined = collectLeafStrings(SHOWCASE_STRINGS.zh).join('\n');

    expect(ENGINEERING_GLOSSARY_TERMS.length).toBe(28);
    expect(enJoined).toContain(`${MUSEUM_EXHIBIT_COUNT} Exhibits`);
    expect(enJoined).toContain(`${MUSEUM_HALL_COUNT} Halls`);
    expect(enJoined).toContain(`${MUSEUM_TOTAL_PARTS}`);
    expect(enJoined).toContain(`${MUSEUM_PBR_WEBP_COUNT}`);
    expect(enJoined).toContain(`${MUSEUM_CARTRIDGE_LAB_TOTAL_COUNT}`);
    expect(enJoined).toContain(`${MUSEUM_BALLISTICS_PROFILE_COUNT}`);
    expect(enJoined).toContain(
      `${MUSEUM_EXHIBIT_COUNT} × ${MUSEUM_EXHIBIT_COUNT - 1}`
    );

    expect(zhJoined).toContain(`${MUSEUM_EXHIBIT_COUNT} 馆藏`);
    expect(zhJoined).toContain(`${MUSEUM_HALL_COUNT} 展厅`);
    expect(zhJoined).toContain(`${MUSEUM_TOTAL_PARTS}`);
    expect(zhJoined).toContain(`${MUSEUM_PBR_WEBP_COUNT}`);
    expect(zhJoined).toContain(
      `${MUSEUM_EXHIBIT_COUNT} × ${MUSEUM_EXHIBIT_COUNT - 1}`
    );
  });

  it('covers all flagship V7 breakthroughs in both EN and ZH with 0 EN CJK & 0 WP-XX', () => {
    const enLeaves = collectLeafStrings(SHOWCASE_STRINGS.en);
    const zhLeaves = collectLeafStrings(SHOWCASE_STRINGS.zh);

    expect(enLeaves.length).toBeGreaterThan(100);
    expect(zhLeaves.length).toBeGreaterThan(100);

    for (const s of enLeaves) {
      expect(CJK_RE.test(s), `Unexpected CJK in EN Showcase: "${s}"`).toBe(
        false
      );
      expect(WP_LEAK_RE.test(s), `Unexpected WP-XX in EN Showcase: "${s}"`).toBe(
        false
      );
    }
    for (const s of zhLeaves) {
      expect(WP_LEAK_RE.test(s), `Unexpected WP-XX in ZH Showcase: "${s}"`).toBe(
        false
      );
    }

    const enAll = enLeaves.join('\n').toLowerCase();
    const zhAll = zhLeaves.join('\n');

    // EN breakthrough coverage
    expect(enAll).toContain('helical rifling');
    expect(enAll).toContain('deflagration');
    expect(enAll).toContain('discarding sabot');
    expect(enAll).toContain('rotary');
    expect(enAll).toContain('bore-evacuator');
    expect(enAll).toContain('stub-case clang');
    expect(enAll).toContain('28-term');
    expect(enAll).toContain(
      `${MUSEUM_EXHIBIT_COUNT} × ${MUSEUM_EXHIBIT_COUNT - 1}`
    );
    expect(enAll).toContain('6-axis');
    expect(enAll).toContain('litz spin-drift');
    expect(enAll).toContain('miller sg');
    expect(enAll).toContain('schlieren');
    expect(enAll).toContain('ar500');
    expect(enAll).toContain('tate hydrodynamic');
    expect(enAll).toContain('blueprint daylight');
    expect(enAll).toContain('75/75');
    expect(enAll).toContain('wcag 2.1 aa');
    expect(enAll).toContain('60 fps');
    expect(enAll).toContain('1:1 true-scale');
    expect(enAll).toContain('recoil');

    // ZH breakthrough coverage
    expect(zhAll).toContain('螺旋膛线');
    expect(zhAll).toContain('燃爆辉光');
    expect(zhAll).toContain('三瓣');
    expect(zhAll).toContain('抽烟装置');
    expect(zhAll).toContain('旋翼');
    expect(zhAll).toContain('底托');
    expect(zhAll).toContain('28 词条');
    expect(zhAll).toContain(
      `${MUSEUM_EXHIBIT_COUNT} × ${MUSEUM_EXHIBIT_COUNT - 1}`
    );
    expect(zhAll).toContain('六轴');
    expect(zhAll).toContain('Litz');
    expect(zhAll).toContain('Miller Sg');
    expect(zhAll).toContain('施利伦');
    expect(zhAll).toContain('AR500');
    expect(zhAll).toContain('Tate 流体侵彻');
    expect(zhAll).toContain('工程白昼');
    expect(zhAll).toContain('75/75');
    expect(zhAll).toContain('WCAG 2.1 AA');
    expect(zhAll).toContain('60 FPS');
  });

  it('references only existing non-empty showcase images and docs screenshots on disk', () => {
    for (const lang of ['zh', 'en'] as const) {
      for (const item of SHOWCASE_STRINGS[lang].gallery.items) {
        const publicPath = path.join(ROOT, 'public', item.imageFile);
        expect(
          fs.existsSync(publicPath),
          `Missing public/${item.imageFile}`
        ).toBe(true);
        expect(fs.statSync(publicPath).size).toBeGreaterThan(0);
      }
    }

    const showcaseSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/showcase/ShowcaseView.tsx'),
      'utf8'
    );
    const stringsSrc = fs.readFileSync(
      path.join(ROOT, 'src/i18n/showcaseStrings.ts'),
      'utf8'
    );

    const showcaseRefs = [
      ...showcaseSrc.matchAll(/resolveAssetUrl\(['"](showcase\/[^'"]+)['"]\)/g),
    ].map((m) => m[1]);
    expect(showcaseRefs.length).toBeGreaterThanOrEqual(4);
    for (const rel of showcaseRefs) {
      const full = path.join(ROOT, 'public', rel);
      expect(fs.existsSync(full), `Missing public/${rel}`).toBe(true);
      expect(fs.statSync(full).size).toBeGreaterThan(0);
    }

    const docsRefs = [
      ...(showcaseSrc + '\n' + stringsSrc).matchAll(
        /docs\/screenshots\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)/g
      ),
    ].map((m) => m[0]);
    for (const rel of docsRefs) {
      const full = path.join(ROOT, rel);
      expect(fs.existsSync(full), `Dangling ${rel}`).toBe(true);
      expect(fs.statSync(full).size).toBeGreaterThan(0);
    }
  });

  it('renders the Live Engineering Certifications Ribbon cleanly while preserving the spotless 2-CTA hero & Blueprint Daylight CSS', () => {
    const initialSnap = useAppStore.getInitialState() as { lang: 'zh' | 'en' };
    const prevInitialLang = initialSnap.lang;
    try {
      for (const lang of ['en', 'zh'] as const) {
        initialSnap.lang = lang;
        useAppStore.setState({ lang });
        const html = renderToStaticMarkup(React.createElement(ShowcaseView));

        // Hero remains uncluttered with strictly 2 primary CTA buttons
        const heroCtaBlock = html.match(
          /<div class="showcase-hero-ctas">([\s\S]*?)<\/div>/
        );
        expect(heroCtaBlock).not.toBeNull();
        expect((heroCtaBlock![1].match(/<button\b/g) ?? []).length).toBe(2);

        // Live Engineering Certifications Ribbon renders all 5 badges in Architecture section
        expect(html).toContain('data-testid="showcase-certifications-ribbon"');
        for (const id of [
          'exhibits',
          'wcag',
          'webgl',
          'pwa',
          'bilingual',
        ] as const) {
          expect(html).toContain(`data-testid="showcase-cert-${id}"`);
        }
        expect(html).toContain('75/75 WCAG 2.1 AA');
        expect(html).toContain('60 FPS WebGL 2.0');

        if (lang === 'en') {
          expect(CJK_RE.test(html.replace(/中文/g, ''))).toBe(false);
        }
        expect(WP_LEAK_RE.test(html)).toBe(false);
      }
    } finally {
      initialSnap.lang = prevInitialLang;
      useAppStore.setState({ lang: prevLang });
    }

    // CSS checks: Dark + Blueprint Daylight + responsive cascade (5-col -> 2-col -> 1-col) + reduced motion + balanced braces
    const css = fs.readFileSync(
      path.join(ROOT, 'src/styles/showcase.css'),
      'utf8'
    );
    expect(css).toContain('.showcase-cert-ribbon');
    expect(css).toContain('.showcase-cert-pill');
    expect(css).toContain(
      ":is([data-theme='light'], .theme-light) .showcase-cert-ribbon"
    );
    expect(css).toContain(
      ":is([data-theme='light'], .theme-light) .showcase-cert-pill.is-emerald"
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*768px\)[\s\S]*?\.showcase-cert-ribbon\s*\{[\s\S]*?grid-template-columns:\s*1fr;/
    );
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.showcase-cert-pill/
    );

    const idxBase = css.indexOf('.showcase-cert-ribbon {');
    const idxMobile = css.indexOf(
      '@media (max-width: 768px) {\n  .showcase-cert-ribbon {'
    );
    expect(idxBase).toBeGreaterThan(-1);
    expect(idxMobile).toBeGreaterThan(idxBase);

    const openBraces = (css.match(/\{/g) ?? []).length;
    const closeBraces = (css.match(/\}/g) ?? []).length;
    expect(openBraces).toBe(closeBraces);
  });
});
