import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WEAPON_RIFLING_SPECS } from '../src/engine/ballistics/riflingSpecs';
import { getGlossaryTermsForWeapon } from '../src/engine/encyclopedia/engineeringGlossary';
import {
  buildAtlasPipelineTelemetry,
  TextureAtlasModal,
  VERIFIED_ATLAS_MAP_COUNT,
  VERIFIED_ATLAS_SUITE_COUNT,
  VERIFIED_TANK_4K_MAP_COUNT,
} from '../src/features/atlas/TextureAtlasModal';
import {
  buildMonographTechnicalAddendum,
  MonographPrintModal,
} from '../src/features/monograph/MonographPrintModal';
import type { LanguageCode } from '../src/narration/types';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u4e00-\u9fff]/;
const WP_TAG_RE = /\bWP-\d+[a-z]?\b/i;

function countChar(text: string, ch: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === ch) count += 1;
  }
  return count;
}

describe('Cycle 19C — Monograph Rifling/Glossary Dossier & Atlas Live Pipeline Telemetry', () => {
  it('buildMonographTechnicalAddendum covers all 100/100 exhibits in zh & en with 0 EN CJK, 0 WP-XX, authentic rifling & non-rifled archery copy', () => {
    expect(WEAPON_MANIFESTS.length).toBe(100);

    let archeryCount = 0;
    let polygonalCount = 0;
    let smoothboreCount = 0;
    let cutRifledCount = 0;

    for (const manifest of WEAPON_MANIFESTS) {
      const id = manifest.id;
      const spec = WEAPON_RIFLING_SPECS[id];
      expect(spec, `Missing rifling spec for ${id}`).toBeDefined();

      if (spec.kind === 'none') archeryCount += 1;
      else if (spec.kind === 'polygonal') polygonalCount += 1;
      else if (spec.kind === 'smoothbore') smoothboreCount += 1;
      else cutRifledCount += 1;

      const expectedTerms = getGlossaryTermsForWeapon(id).slice(0, 2);
      expect(
        expectedTerms.length,
        `${id} must map to 2 glossary principles`
      ).toBe(2);

      for (const lang of ['zh', 'en'] as readonly LanguageCode[]) {
        const dossier = buildMonographTechnicalAddendum(id, lang);

        expect(dossier.weaponId).toBe(id);
        expect(dossier.lang).toBe(lang);
        expect(dossier.bayCode).toBe(manifest.catalog.bayCode);
        expect(dossier.riflingKind).toBe(spec.kind);
        expect(dossier.isArchery).toBe(spec.kind === 'none');
        expect(dossier.principles.length).toBe(2);
        expect(dossier.principles.map((p) => p.id)).toEqual(
          expectedTerms.map((t) => t.id)
        );

        const serialized = [
          dossier.eyebrow,
          dossier.sectionAriaLabel,
          dossier.boreSectionHeading,
          dossier.principlesHeading,
          dossier.profileBadge,
          dossier.boreSpecLabel,
          dossier.boreDiameterText,
          dossier.twistOrPropulsionText,
          dossier.linerOrTrackText,
          ...dossier.principles.flatMap((p) => [p.term, p.summary]),
        ].join(' | ');

        expect(serialized.trim().length).toBeGreaterThan(20);
        expect(serialized, `WP-XX leak in ${id} (${lang})`).not.toMatch(
          WP_TAG_RE
        );

        if (lang === 'en') {
          expect(serialized, `CJK leak in ${id} (en)`).not.toMatch(CJK_RE);
          expect(dossier.boreSpecLabel).toBe(spec.labelEn);
        } else {
          expect(dossier.boreSpecLabel).toBe(spec.labelZh);
        }

        if (spec.kind === 'none') {
          expect(dossier.isArchery).toBe(true);
          expect(dossier.riflingKind).toBe('none');
          if (lang === 'en') {
            expect(dossier.profileBadge).toMatch(/CAM PROPULSION/i);
            expect(dossier.boreDiameterText).toMatch(/Unbarreled/i);
          } else {
            expect(dossier.profileBadge).toMatch(/凸轮推进/);
            expect(dossier.boreDiameterText).toMatch(/无枪管/);
          }
        } else {
          expect(dossier.isArchery).toBe(false);
          expect(dossier.boreDiameterText).toContain(
            `${spec.boreDiameterMm.toFixed(1)} mm`
          );
        }
      }
    }

    expect(archeryCount).toBe(5);
    expect(polygonalCount).toBeGreaterThanOrEqual(3);
    expect(smoothboreCount).toBeGreaterThanOrEqual(11);
    expect(cutRifledCount).toBeGreaterThanOrEqual(70);
    expect(
      archeryCount + polygonalCount + smoothboreCount + cutRifledCount
    ).toBe(100);
  });

  it('buildAtlasPipelineTelemetry reports accurate WebP ORM + KTX2 states & 101/414/24 inventory in zh & en with 0 EN CJK & 0 WP-XX', () => {
    expect(VERIFIED_ATLAS_SUITE_COUNT).toBe(101);
    expect(VERIFIED_ATLAS_MAP_COUNT).toBe(414);
    expect(VERIFIED_TANK_4K_MAP_COUNT).toBe(24);

    const states = [
      {
        status: { initialized: false, gpuSupported: false, publishedCount: 0 },
        expectedMode: 'webp_fallback' as const,
      },
      {
        status: { initialized: true, gpuSupported: true, publishedCount: 0 },
        expectedMode: 'transcoder_ready' as const,
      },
      {
        status: { initialized: true, gpuSupported: true, publishedCount: 414 },
        expectedMode: 'gpu_published' as const,
      },
    ];

    for (const { status, expectedMode } of states) {
      for (const lang of ['zh', 'en'] as readonly LanguageCode[]) {
        const telemetry = buildAtlasPipelineTelemetry(status, lang);
        expect(telemetry.ktx2Mode).toBe(expectedMode);
        expect(telemetry.totalSuites).toBe(101);
        expect(telemetry.totalMaps).toBe(414);
        expect(telemetry.tank4kMaps).toBe(24);

        const joined = [
          telemetry.ariaLabel,
          telemetry.kicker,
          telemetry.activeCodecLabel,
          telemetry.ktx2StatusLabel,
          telemetry.inventorySummary,
        ].join(' | ');

        expect(joined).toContain('WebP');
        expect(joined).toContain('ORM');
        expect(joined).toContain('KTX2');
        expect(joined).toContain('101');
        expect(joined).toContain('414');
        expect(joined).toContain('24');
        expect(joined).not.toMatch(WP_TAG_RE);

        if (lang === 'en') {
          expect(joined).not.toMatch(CJK_RE);
          expect(telemetry.activeCodecLabel).toBe(
            'WebP 5-Channel Packed ORM Active'
          );
          expect(telemetry.inventorySummary).toBe(
            '101 Material Suites · 414 Maps · 24× 4K MBT Textures'
          );
        }
      }
    }
  });

  it('SSR-renders MonographPrintModal with archival rifling/glossary strip and localized WCAG 2.1 AA dialog landmarks', () => {
    const html = renderToStaticMarkup(
      React.createElement(MonographPrintModal, { forceOpen: true })
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('data-testid="monograph-rifling-glossary-strip"');
    expect(html).toContain('class="dk-technical-addendum');
    expect(html).toContain('class="dk-ta-principle-card"');
    expect(html).toContain('<nav class="ms-page-jump-rail"');

    // Localized group labels (default Zustand SSR state is zh; no hardcoded English group labels)
    expect(html).not.toContain('aria-label="Book Style"');
    expect(html).not.toContain('aria-label="Edition"');
    expect(html).not.toContain('aria-label="Layout"');
    expect(html).not.toContain('aria-label="Pages"');
    expect(html).not.toContain('aria-label="Quality"');
    expect(html).toContain('aria-label="画册装帧风格"');
    expect(html).toContain('aria-label="纸张与配色版本"');
    expect(html).not.toMatch(WP_TAG_RE);
  });

  it('SSR-renders TextureAtlasModal with live pipeline telemetry banner, valid tablist/tab ARIA roles, and aria-pressed live toggle', () => {
    const html = renderToStaticMarkup(
      React.createElement(TextureAtlasModal, { forceOpen: true })
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('data-testid="atlas-pipeline-telemetry"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('101');
    expect(html).toContain('414');
    expect(html).toContain('24× 4K');
    expect(html).toContain('KTX2 Basis Universal');

    // Preserve existing search bar & pipeline badges contracts
    expect(html).toContain('data-testid="atlas-search-bar"');
    expect(html).toContain('data-testid="atlas-search-input"');
    expect(html).toContain('data-testid="atlas-pipeline-badges"');

    // WCAG 2.1 AA tablist/tab & toggle button parity
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toMatch(/class="tex-live-toggle[^"]*"[^>]*aria-pressed="/);
    expect(html).not.toMatch(WP_TAG_RE);
  });

  it('preserves strict React.lazy isolation, @media print rules, balanced CSS braces, Daylight parity, and >=34px mobile touch targets', () => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
    expect(appSrc).toMatch(
      /lazy\(\s*\(\)\s*=>\s*import\(['"]\.\/features\/monograph\/MonographPrintModal['"]\)/
    );
    expect(appSrc).toMatch(
      /lazy\(\s*\(\)\s*=>\s*import\(['"]\.\/features\/atlas\/TextureAtlasModal['"]\)/
    );
    expect(appSrc).not.toMatch(
      /^import\s+.*from\s+['"]\.\/features\/monograph\/MonographPrintModal['"]/m
    );
    expect(appSrc).not.toMatch(
      /^import\s+.*from\s+['"]\.\/features\/atlas\/TextureAtlasModal['"]/m
    );

    const distIndexPath = path.join(ROOT, 'dist/index.html');
    if (fs.existsSync(distIndexPath)) {
      const distHtml = fs.readFileSync(distIndexPath, 'utf8');
      expect(distHtml).not.toContain('MonographPrintModal');
      expect(distHtml).not.toContain('TextureAtlasModal');
    }

    const dkCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/dk-monograph.css'),
      'utf8'
    );
    expect(countChar(dkCss, '{')).toBe(countChar(dkCss, '}'));
    expect(dkCss).toContain('.dk-technical-addendum');
    expect(dkCss).toContain('@media print');
    expect(dkCss).toContain('size: 420mm 297mm');
    expect(dkCss).toContain('size: 210mm 297mm');
    expect(dkCss).toContain('break-after: page');
    expect(dkCss).toContain(":is([data-theme='light'], .theme-light) .dk-technical-addendum");
    expect(dkCss).toContain('@media screen and (max-width: 768px)');
    expect(dkCss).toContain('min-height: 34px;');

    const atlasCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/atlas-modal.css'),
      'utf8'
    );
    expect(countChar(atlasCss, '{')).toBe(countChar(atlasCss, '}'));
    expect(atlasCss).toContain('.tex-telemetry-banner');
    expect(atlasCss).toContain("[data-theme='light'] .tex-telemetry-banner");
    expect(atlasCss).toContain('overflow-x: clip;');
    expect(atlasCss).toContain('@media (max-width: 768px)');
    expect(atlasCss).toContain('min-height: 34px;');
    expect(atlasCss).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
