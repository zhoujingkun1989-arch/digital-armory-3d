import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyLocationToStore,
  parseMonographDeepLinkParams,
} from '../src/app/useUrlStateSync';
import {
  projectExplodedPartAnchors,
  projectLoupeAnchors,
  solveDkAnnotatedCallouts,
  solveExplodedPinLayout,
} from '../src/features/monograph/explodedPinLayout';
import {
  buildMonographCacheKey,
  MONOGRAPH_PLATE_KEYS,
  type MonographCaptureBundle,
  type MonographLayoutMode,
  type MonographPageMode,
  type MonographPlateKey,
  type MonographPlateSource,
} from '../src/features/monograph/monographCaptureStore';
import { assembleMonographDossier } from '../src/features/monograph/monographDataAssembler';
import {
  distillBreakthroughSummary,
  MonographDkDocument,
} from '../src/features/monograph/MonographDkDocument';
import {
  computeMonographPrintGeometry,
  resolvePublicMonographOrigin,
} from '../src/features/monograph/MonographPrintModal';
import { getDkEncyclopediaStrings } from '../src/features/monograph/monographStrings';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import type { LanguageCode, WeaponNarrationBundle } from '../src/narration/types';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponPlugin } from '../src/weapons/registry';
import type { WeaponId } from '../src/weapons/types';

const NARRATIONS_DIR = path.resolve(__dirname, '../public/narrations');
const CJK_RE = /[\u4e00-\u9fff]/;

function loadNarrationBundle(weaponId: WeaponId): WeaponNarrationBundle {
  return JSON.parse(
    fs.readFileSync(path.join(NARRATIONS_DIR, `${weaponId}.json`), 'utf8')
  ) as WeaponNarrationBundle;
}

async function buildMockDkCaptureBundle(
  weaponId: WeaponId,
  withCyclesMasters = false
): Promise<MonographCaptureBundle> {
  const plugin = await loadWeaponPlugin(weaponId);
  const cam = new THREE.PerspectiveCamera(36, 16 / 10, 0.1, 640);
  cam.position.set(14, 7, 88);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);

  const heroAnchors = projectExplodedPartAnchors(weaponId, plugin.parts, cam, 0);
  const explodedAnchors = projectExplodedPartAnchors(
    weaponId,
    plugin.parts,
    cam,
    1.0
  );
  const internalParts = plugin.parts.filter((p) => !p.isShell);
  const cutawayAnchors = projectExplodedPartAnchors(
    weaponId,
    internalParts.length >= 6 ? internalParts : plugin.parts,
    cam,
    0
  );

  const plates = Object.fromEntries(
    MONOGRAPH_PLATE_KEYS.map((k) => [k, `data:image/png;base64,MOCK_${k}`])
  ) as Record<MonographPlateKey, string>;

  const plateSources = Object.fromEntries(
    MONOGRAPH_PLATE_KEYS.map((k, idx) => [
      k,
      withCyclesMasters && idx < 10 ? 'cycles_4k' : 'webgl_2880',
    ])
  ) as Partial<Record<MonographPlateKey, MonographPlateSource>>;

  return {
    cacheKey: buildMonographCacheKey(weaponId, 'dk_encyclopedia', 'print_2880'),
    weaponId,
    edition: 'dk_encyclopedia',
    quality: 'print_2880',
    capturedAtIso: '2026-11-19T00:00:00.000Z',
    plates,
    plateSources,
    explodedPins: solveExplodedPinLayout(explodedAnchors),
    dkHeroCallouts: solveDkAnnotatedCallouts(heroAnchors, 10),
    dkCutawayCallouts: solveDkAnnotatedCallouts(cutawayAnchors, 9),
    dkExplodedCallouts: solveDkAnnotatedCallouts(explodedAnchors, 12),
    loupeAnchors: projectLoupeAnchors(weaponId, plugin.parts, cam),
  };
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

describe('DK Visual Encyclopedia Layout, Spread Geometry, Bilingual Strings & Deep-Link Contracts', () => {
  beforeEach(() => {
    useAppStore.getState().closeMonographModal();
  });

  it('SSR-renders MonographDkDocument across spread_a3 & portrait_a4, full_8p & compact_4p, zh & en, with & without prepress bleed', async () => {
    const plugin = await loadWeaponPlugin('p08');
    const narration = loadNarrationBundle('p08');
    const captureBundle = await buildMockDkCaptureBundle('p08', true);

    const layouts: MonographLayoutMode[] = ['spread_a3', 'portrait_a4'];
    const pageModes: MonographPageMode[] = ['full_8p', 'compact_4p'];
    const langs: LanguageCode[] = ['zh', 'en'];

    for (const layoutMode of layouts) {
      for (const pageMode of pageModes) {
        const expectedSheets =
          layoutMode === 'spread_a3'
            ? pageMode === 'full_8p'
              ? 4
              : 2
            : pageMode === 'full_8p'
              ? 8
              : 4;

        for (const lang of langs) {
          const dossier = assembleMonographDossier(
            'p08',
            plugin,
            lang,
            narration,
            'https://armory.example.org/'
          );

          for (const prepress of [false, true] as const) {
            const html = renderToStaticMarkup(
              React.createElement(MonographDkDocument, {
                dossier,
                captureBundle,
                edition: 'dk_encyclopedia',
                layoutMode,
                pageMode,
                collectorCallsign: 'ARCHIVIST-08',
                prepress,
              })
            );

            // Exact sheet count (4 spreads vs 2 spreads vs 8 pages vs 4 pages)
            if (layoutMode === 'spread_a3') {
              expect(countOccurrences(html, 'class="dk-spread-sheet')).toBe(
                expectedSheets
              );
              expect(html).toContain('data-spread="1"');
              expect(html).toContain(`data-spread="${expectedSheets}"`);
            } else {
              expect(countOccurrences(html, 'class="dk-page-sheet')).toBe(
                expectedSheets
              );
              expect(html).toContain('data-page="1"');
              expect(html).toContain(`data-page="${expectedSheets}"`);
            }

            // Pre-press ISO 12647 crop marks match sheet count exactly when enabled
            expect(countOccurrences(html, 'data-prepress-marks="true"')).toBe(
              prepress ? expectedSheets : 0
            );

            // Zero broken plate placeholders when full 17-plate capture bundle is provided
            expect(html).not.toContain('dk-plate-placeholder');

            // Core DK Visual Encyclopedia vector components present
            expect(html).toContain('dk-annotated-plate-overlay');
            expect(html).toContain('dk-callout-label');
            expect(html).toContain('dk-true-scale-ruler');
            expect(html).toContain('ARCHIVIST-08');
            expect(html).toContain(dossier.serialCode);

            if (pageMode === 'full_8p' || layoutMode === 'spread_a3') {
              expect(html).toContain('dk-evolution-timeline-strip');
            }
            if (layoutMode === 'spread_a3' || pageMode === 'full_8p') {
              expect(html).toContain('dk-circular-loupe-strip');
              expect(html).toContain('dk-loupe-mag-pill');
            }
            if (pageMode === 'full_8p' || layoutMode === 'portrait_a4') {
              expect(html).toContain('dk-actual-size-cartridge-plate');
              expect(html).toContain('dk-actual-size-cartridge-svg');
              expect(html).toContain('1:1');
            }

            // Cycles 4K master provenance shown in archive seal colophon
            if (pageMode === 'full_8p' || layoutMode === 'spread_a3' || layoutMode === 'portrait_a4') {
              expect(html).toContain('Blender Cycles 4K');
              expect(html).toContain('(10/17)');
            }

            // Zero CJK leaks in English renders
            if (lang === 'en') {
              expect(
                html,
                `CJK leak in p08 ${layoutMode} ${pageMode} prepress=${prepress}`
              ).not.toMatch(CJK_RE);
            }
          }
        }
      }
    }
  });

  it('adapts 1:1 cartridge orientation cleanly for giant calibers (m82a1 .50 BMG) and archery exhibits (lift33, r500) with 0 CJK in English', async () => {
    const testCases: Array<{
      weaponId: WeaponId;
      expectedCartOrientation: 'vertical' | 'horizontal';
      expectedScaleAttr: string;
    }> = [
      {
        weaponId: 'ak15',
        expectedCartOrientation: 'vertical',
        expectedScaleAttr: 'data-scale="1:1"',
      },
      {
        weaponId: 'm82a1',
        expectedCartOrientation: 'horizontal',
        expectedScaleAttr: 'data-scale="1:1"',
      },
      {
        weaponId: 'lift33',
        expectedCartOrientation: 'horizontal',
        expectedScaleAttr: 'data-scale="1:5"',
      },
      {
        weaponId: 'r500',
        expectedCartOrientation: 'horizontal',
        expectedScaleAttr: 'data-scale="1:4"',
      },
    ];

    for (const tc of testCases) {
      const plugin = await loadWeaponPlugin(tc.weaponId);
      const narration = loadNarrationBundle(tc.weaponId);
      const captureBundle = await buildMockDkCaptureBundle(tc.weaponId, false);
      const dossierEn = assembleMonographDossier(
        tc.weaponId,
        plugin,
        'en',
        narration,
        'https://armory.example.org/'
      );

      const htmlSpread = renderToStaticMarkup(
        React.createElement(MonographDkDocument, {
          dossier: dossierEn,
          captureBundle,
          layoutMode: 'spread_a3',
          pageMode: 'full_8p',
          collectorCallsign: 'CURATOR',
          prepress: true,
        })
      );

      expect(htmlSpread).not.toMatch(CJK_RE);
      expect(htmlSpread).not.toContain('dk-plate-placeholder');
      expect(htmlSpread).toContain(
        `dk-actual-size-cartridge-plate is-${tc.expectedCartOrientation}`
      );
      expect(htmlSpread).toContain(tc.expectedScaleAttr);
      expect(htmlSpread).toContain('300 DPI');
    }
  });

  it('enforces 100% bilingual zh/en parity and 0 CJK leaks across UI monograph strings & DK editorial strings', () => {
    const zhMono = UI_STRINGS.zh.monograph;
    const enMono = UI_STRINGS.en.monograph;

    expect(Object.keys(enMono).sort()).toEqual(Object.keys(zhMono).sort());

    const checkValueForCjk = (val: unknown, label: string) => {
      if (typeof val === 'string') {
        expect(val.trim().length, `${label} empty`).toBeGreaterThan(0);
        expect(val, `${label} CJK leak`).not.toMatch(CJK_RE);
      } else if (typeof val === 'function') {
        const fn = val as (...args: unknown[]) => unknown;
        const out = fn('AK-15', 10, 17);
        if (typeof out === 'string') {
          expect(out, `${label}() CJK leak`).not.toMatch(CJK_RE);
        }
      }
    };

    for (const [key, val] of Object.entries(enMono)) {
      if (key === 'kids') continue;
      checkValueForCjk(val, `UI_STRINGS.en.monograph.${key}`);
    }

    for (const isArchery of [false, true] as const) {
      const zhDk = getDkEncyclopediaStrings('zh', isArchery);
      const enDk = getDkEncyclopediaStrings('en', isArchery);
      expect(Object.keys(enDk).sort()).toEqual(Object.keys(zhDk).sort());

      for (const [k, v] of Object.entries(enDk)) {
        checkValueForCjk(v, `dkStrings.en(archery=${isArchery}).${k}`);
      }
      for (const [k, v] of Object.entries(zhDk)) {
        if (typeof v === 'string') {
          expect(v.trim().length, `zh ${k} empty`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('parses ?monograph=1 deep-link query params accurately and boots Monograph Studio state in store', () => {
    const fullQuery =
      '?monograph=1&weapon=p08&style=dk_encyclopedia&edition=dk_encyclopedia&layout=spread_a3&pages=full_8p&quality=print_2880&lang=en&prepress=1&callsign=CURATOR-P08';

    const parsed = parseMonographDeepLinkParams(fullQuery);
    expect(parsed).toEqual({
      open: true,
      weaponId: 'p08',
      styleMode: 'dk_encyclopedia',
      edition: 'dk_encyclopedia',
      layoutMode: 'spread_a3',
      pageMode: 'full_8p',
      quality: 'print_2880',
      lang: 'en',
      prepress: true,
      collectorCallsign: 'CURATOR-P08',
    });

    // Rejects unknown enum tokens safely without throwing
    const malformed = parseMonographDeepLinkParams(
      '?monograph=true&weapon=nonexistent&style=unknown&edition=bad&layout=a0&pages=99p&quality=8k&prepress=0'
    );
    expect(malformed.open).toBe(true);
    expect(malformed.weaponId).toBeUndefined();
    expect(malformed.styleMode).toBeUndefined();
    expect(malformed.edition).toBeUndefined();
    expect(malformed.layoutMode).toBeUndefined();
    expect(malformed.pageMode).toBeUndefined();
    expect(malformed.quality).toBeUndefined();
    expect(malformed.prepress).toBe(false);

    // Hydrates Zustand store directly on deep-link boot
    applyLocationToStore(fullQuery);
    const st = useAppStore.getState();
    expect(st.monographModalOpen).toBe(true);
    expect(st.monographWeaponId).toBe('p08');
    expect(st.lang).toBe('en');
    expect(st.monographLaunchOptions).toEqual({
      styleMode: 'dk_encyclopedia',
      edition: 'dk_encyclopedia',
      layoutMode: 'spread_a3',
      pageMode: 'full_8p',
      quality: 'print_2880',
      prepress: true,
      collectorCallsign: 'CURATOR-P08',
    });
  });

  it('computes exact ISO 216 / ISO 12647 pre-press sheet geometry matching export_dk_pdf.mjs and wires CSS + npm script', () => {
    expect(
      computeMonographPrintGeometry('dk_encyclopedia', 'spread_a3', 'full_8p', true)
    ).toEqual({
      effectiveLayout: 'spread_a3',
      effectivePrepress: true,
      trimWidthMm: 420,
      trimHeightMm: 297,
      bleedMm: 3,
      sheetWidthMm: 426,
      sheetHeightMm: 303,
      sheetCount: 4,
    });

    expect(
      computeMonographPrintGeometry('dk_encyclopedia', 'spread_a3', 'compact_4p', false)
    ).toEqual({
      effectiveLayout: 'spread_a3',
      effectivePrepress: false,
      trimWidthMm: 420,
      trimHeightMm: 297,
      bleedMm: 0,
      sheetWidthMm: 420,
      sheetHeightMm: 297,
      sheetCount: 2,
    });

    expect(
      computeMonographPrintGeometry('dk_encyclopedia', 'portrait_a4', 'full_8p', true)
    ).toEqual({
      effectiveLayout: 'portrait_a4',
      effectivePrepress: true,
      trimWidthMm: 210,
      trimHeightMm: 297,
      bleedMm: 3,
      sheetWidthMm: 216,
      sheetHeightMm: 303,
      sheetCount: 8,
    });

    expect(
      computeMonographPrintGeometry('pro_dossier', 'spread_a3', 'full_8p', true)
    ).toEqual({
      effectiveLayout: 'portrait_a4',
      effectivePrepress: false,
      trimWidthMm: 210,
      trimHeightMm: 297,
      bleedMm: 0,
      sheetWidthMm: 210,
      sheetHeightMm: 297,
      sheetCount: 8,
    });

    // Verify package.json script & CSS wiring
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts['monograph:pdf']).toBe('node scripts/export_dk_pdf.mjs');

    const indexCss = fs.readFileSync(
      path.resolve(__dirname, '../src/styles/index.css'),
      'utf8'
    );
    expect(indexCss).toContain("@import './dk-monograph.css';");

    const dkCss = fs.readFileSync(
      path.resolve(__dirname, '../src/styles/dk-monograph.css'),
      'utf8'
    );
    expect(dkCss).toContain('size: 420mm 297mm');
    expect(dkCss).toContain('size: 426mm 303mm');
    expect(dkCss).toContain('size: 210mm 297mm');
    expect(dkCss).toContain('size: 216mm 303mm');

    const monographCss = fs.readFileSync(
      path.resolve(__dirname, '../src/styles/monograph.css'),
      'utf8'
    );
    expect(monographCss).toContain('var(--monograph-print-width, 210mm)');
  });

  it('enforces Art-Director QA polish: authoritative 4-phase copy, complete breakthrough sentences, dense A4 BOM, no duplicate loupe bridge & loopback QR sanitization', async () => {
    const p08Plugin = await loadWeaponPlugin('p08');
    const p08Narration = loadNarrationBundle('p08');
    const p08Capture = await buildMockDkCaptureBundle('p08', true);
    const p08DossierZh = assembleMonographDossier(
      'p08',
      p08Plugin,
      'zh',
      p08Narration,
      'https://zhoujingkun1989-arch.github.io/digital-armory-3d/'
    );

    const htmlA4Zh = renderToStaticMarkup(
      React.createElement(MonographDkDocument, {
        dossier: p08DossierZh,
        captureBundle: p08Capture,
        layoutMode: 'portrait_a4',
        pageMode: 'full_8p',
        collectorCallsign: 'CURATOR',
        prepress: true,
      })
    );

    // 1. A4 Page 6 BOM uses ultra-dense class for 25-part P08 so all rows + QA bar fit cleanly
    expect(htmlA4Zh).toContain('dk-bom-table is-ultra-dense');
    // 2. Authoritative DK 4-phase action captions replace kids baby-talk
    expect(htmlA4Zh).toContain('闭锁待击');
    expect(htmlA4Zh).toContain('击发建压');
    expect(htmlA4Zh).not.toContain('小弹头安静停在起点');
    expect(htmlA4Zh).not.toContain('高高抛出去');
    // 3. No duplicate detached red-dot loupe connector bridge; A4 P2 keeps real weapon connector overlay
    expect(htmlA4Zh).not.toContain('dk-loupe-connector-bridge');
    expect(htmlA4Zh).toContain('dk-loupe-hero-connector-svg');

    // 4. Stacked ballistics class applies on Garand (.30-06 horizontal) and NOT on P08 (9mm vertical)
    expect(htmlA4Zh).not.toContain('has-stacked-ballistics');
    const garandPlugin = await loadWeaponPlugin('garand');
    const garandCapture = await buildMockDkCaptureBundle('garand', false);
    const garandDossierEn = assembleMonographDossier(
      'garand',
      garandPlugin,
      'en',
      loadNarrationBundle('garand'),
      'https://zhoujingkun1989-arch.github.io/digital-armory-3d/'
    );
    const garandSpreadEn = renderToStaticMarkup(
      React.createElement(MonographDkDocument, {
        dossier: garandDossierEn,
        captureBundle: garandCapture,
        layoutMode: 'spread_a3',
        pageMode: 'full_8p',
        collectorCallsign: 'CURATOR',
        prepress: true,
      })
    );
    expect(garandSpreadEn).toContain('has-stacked-ballistics');
    expect(garandSpreadEn).not.toContain('dk-loupe-connector-bridge');
    expect(garandSpreadEn).toContain('Locked &amp; Ready');
    expect(garandSpreadEn).not.toMatch(CJK_RE);

    // 5. Breakthrough summary distillation produces complete sentences without trailing ellipses
    const longEn =
      'Precision dual-link toggle-lock stays below dead center by 1.5 degrees with an automatic geometric lock; only after recoil hits the curved ramps does it fold cleanly.';
    const distilledEn = distillBreakthroughSummary(longEn, 'en');
    expect(distilledEn.endsWith('.')).toBe(true);
    expect(distilledEn).not.toContain('...');
    expect(distilledEn).not.toContain('…');
    expect(distilledEn.length).toBeLessThanOrEqual(112);

    const longZh =
      '双连杆肘节闭锁在闭锁位置停靠于死点线下方 1.5° 形成过死点刚性自锁；直至枪管短后坐撞击机匣尾部双弧形导坡才凌空上折完成安全开锁与抛壳。';
    const distilledZh = distillBreakthroughSummary(longZh, 'zh');
    expect(distilledZh.endsWith('。')).toBe(true);
    expect(distilledZh).not.toContain('...');
    expect(distilledZh).not.toContain('…');
    expect(distilledZh.length).toBeLessThanOrEqual(51);

    // 6. Loopback origin sanitizer replaces 127.0.0.1 / localhost / ::1 with public GitHub Pages museum URL
    expect(resolvePublicMonographOrigin({ hostname: '127.0.0.1' })).toBe(
      'https://zhoujingkun1989-arch.github.io/digital-armory-3d/'
    );
    expect(resolvePublicMonographOrigin({ hostname: 'localhost' })).toBe(
      'https://zhoujingkun1989-arch.github.io/digital-armory-3d/'
    );
    expect(resolvePublicMonographOrigin({ hostname: '::1' })).toBe(
      'https://zhoujingkun1989-arch.github.io/digital-armory-3d/'
    );
    expect(
      resolvePublicMonographOrigin({
        hostname: 'zhoujingkun1989-arch.github.io',
      })
    ).toBeUndefined();

    // 7. Callout breathing margin reservations & dense BOM CSS rules present
    const dkCss = fs.readFileSync(
      path.resolve(__dirname, '../src/styles/dk-monograph.css'),
      'utf8'
    );
    expect(dkCss).toContain('padding: 12mm 4mm 13mm');
    expect(dkCss).toContain('padding: 13mm 1mm 13mm');
    expect(dkCss).toContain('max-height: 76mm');
    expect(dkCss).toContain('.dk-bom-table.is-ultra-dense');
  });
});
