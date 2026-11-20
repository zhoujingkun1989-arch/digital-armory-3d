import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config';
import {
  normalizeBasePath,
  normalizeTextureFileName,
  resolveAppDeepLink,
  resolveAssetUrl,
  resolveTextureUrl,
} from '../src/engine/utils/assetUrl';
import { encodeQrMatrix } from '../src/features/monograph/qrCodeSvg';
import {
  assemblePosterMetadata,
  buildPosterDeepLinkUrl,
  buildPosterFilename,
  computePosterLayout,
  fitFontToWidth,
  POSTER_DIMENSIONS,
  POSTER_THEMES,
  type PosterRect,
  readSavedArmorerRank,
  renderPosterToCanvas,
} from '../src/features/share/posterComposer';
import {
  closePosterShareModal,
  openPosterShareModal,
  PosterShareModal,
} from '../src/features/share/PosterShareModal';
import {
  POSTER_SHARE_STRINGS,
  type PosterArmorerRank,
  type PosterAspectRatio,
  type PosterThemeId,
} from '../src/features/share/posterShareStrings';
import { WEAPON_IDS } from '../src/weapons/types';

const CJK_REGEX = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;

function collectStringsFromTree(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (typeof node === 'function') {
    const fn = node as (...args: unknown[]) => unknown;
    const sampleArgs = [1920, 1080, '16:9'];
    const res = fn(...sampleArgs);
    if (typeof res === 'string') {
      out.push(res);
    }
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectStringsFromTree(item, out);
    }
    return out;
  }
  if (node && typeof node === 'object') {
    for (const val of Object.values(node)) {
      collectStringsFromTree(val, out);
    }
  }
  return out;
}

function rectsOverlap(a: PosterRect, b: PosterRect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function createMockCanvasAndContext() {
  const calls = {
    fillRectCount: 0,
    strokeCount: 0,
    fillTextLabels: [] as string[],
    drawImageCount: 0,
  };

  const gradientStub = {
    addColorStop: () => undefined,
  };

  const ctx = {
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '12px sans-serif',
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
      calls.strokeCount += 1;
    },
    fillRect: () => {
      calls.fillRectCount += 1;
    },
    fillText: (text: string) => {
      calls.fillTextLabels.push(text);
    },
    measureText: (text: string) => {
      const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
      const px = m ? Number(m[1]) : 12;
      let units = 0;
      for (let i = 0; i < text.length; i++) {
        units += text.charCodeAt(i) > 0x2e7f ? 1.0 : 0.56;
      }
      return { width: units * px };
    },
    createLinearGradient: () => gradientStub,
    createRadialGradient: () => gradientStub,
    drawImage: () => {
      calls.drawImageCount += 1;
    },
    getImageData: () => ({ data: new Uint8ClampedArray(8 * 8 * 4) }),
  } as unknown as CanvasRenderingContext2D;

  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind: string) => (kind === '2d' ? ctx : null),
  } as unknown as HTMLCanvasElement;

  return { canvas, calls };
}

describe('Bundle Code-Splitting, VITE_BASE_PATH Subpath & HD Poster Studio Contracts', () => {
  it('normalizes root ("/") and GitHub Pages ("/digital-armory-3d/") base paths & asset URLs idempotently', () => {
    expect(normalizeBasePath(undefined)).toBe('/');
    expect(normalizeBasePath('')).toBe('/');
    expect(normalizeBasePath('/')).toBe('/');
    expect(normalizeBasePath('./')).toBe('./');
    expect(normalizeBasePath('digital-armory-3d')).toBe('/digital-armory-3d/');
    expect(normalizeBasePath('/digital-armory-3d')).toBe('/digital-armory-3d/');
    expect(normalizeBasePath('/digital-armory-3d/')).toBe(
      '/digital-armory-3d/'
    );
    expect(normalizeBasePath('//digital-armory-3d///')).toBe(
      '/digital-armory-3d/'
    );

    // Root deployment ('/')
    expect(resolveAssetUrl('narrations/ak15.json', '/')).toBe(
      '/narrations/ak15.json'
    );
    expect(resolveAssetUrl('/audio/ak15/story_act1_zh.mp3', '/')).toBe(
      '/audio/ak15/story_act1_zh.mp3'
    );
    expect(resolveTextureUrl('ak15_steel_albedo.png', '/')).toBe(
      '/textures/ak15_steel_albedo.webp'
    );

    // Subpath deployment ('/digital-armory-3d/')
    const sub = '/digital-armory-3d/';
    expect(resolveAssetUrl('narrations/garand.json', sub)).toBe(
      '/digital-armory-3d/narrations/garand.json'
    );
    expect(resolveAssetUrl('/audio/garand/story_act4_en.mp3', sub)).toBe(
      '/digital-armory-3d/audio/garand/story_act4_en.mp3'
    );
    expect(resolveAssetUrl('showcase/ak15-section.webp', 'digital-armory-3d')).toBe(
      '/digital-armory-3d/showcase/ak15-section.webp'
    );
    expect(resolveTextureUrl('/textures/python_blued_albedo.png', sub)).toBe(
      '/digital-armory-3d/textures/python_blued_albedo.webp'
    );
    expect(
      normalizeTextureFileName(
        '/digital-armory-3d/textures/benellim4_receiver_roughness.png'
      )
    ).toBe('benellim4_receiver_roughness.webp');

    // Idempotent when called twice on an already-prefixed subpath URL
    const once = resolveAssetUrl('audio/p90/story_act2_zh.mp3', sub);
    expect(resolveAssetUrl(once, sub)).toBe(
      '/digital-armory-3d/audio/p90/story_act2_zh.mp3'
    );

    // External / data / blob URLs remain untouched
    expect(
      resolveAssetUrl('https://example.com/banner.webp', sub)
    ).toBe('https://example.com/banner.webp');
    expect(resolveAssetUrl('data:image/png;base64,AAAA', sub)).toBe(
      'data:image/png;base64,AAAA'
    );
  });

  it('resolves deep links & showcase.html cleanly across root and non-root subpaths', () => {
    expect(
      buildPosterDeepLinkUrl('ak15', {
        origin: 'https://example.com',
        baseOverride: '/',
      })
    ).toBe('https://example.com/?screen=workbench&weapon=ak15&cut=1');

    expect(
      buildPosterDeepLinkUrl('benellim4', {
        origin: 'https://zhoujingkun1989-arch.github.io',
        baseOverride: '/digital-armory-3d/',
      })
    ).toBe(
      'https://zhoujingkun1989-arch.github.io/digital-armory-3d/?screen=workbench&weapon=benellim4&cut=1'
    );

    expect(
      buildPosterDeepLinkUrl('p90', {
        origin: 'https://zhoujingkun1989-arch.github.io',
        pathname: '/digital-armory-3d/showcase.html',
      })
    ).toBe(
      'https://zhoujingkun1989-arch.github.io/digital-armory-3d/?screen=workbench&weapon=p90&cut=1'
    );

    expect(
      resolveAppDeepLink('showcase.html', {
        origin: 'https://zhoujingkun1989-arch.github.io',
        baseOverride: '/digital-armory-3d',
      })
    ).toBe(
      'https://zhoujingkun1989-arch.github.io/digital-armory-3d/showcase.html'
    );
  });

  it('splits heavy specs, i18n & three postfx chunks cleanly in vite.config.ts and keeps CI workflow updated', () => {
    const resolvedCfg = viteConfig;

    expect(resolvedCfg.build?.chunkSizeWarningLimit).toBeLessThanOrEqual(800);

    const output = resolvedCfg.build?.rollupOptions?.output;
    const singleOutput = Array.isArray(output) ? output[0] : output;
    const manualChunks = singleOutput?.manualChunks;
    expect(typeof manualChunks).toBe('function');

    if (typeof manualChunks === 'function') {
      const chunkOf = (id: string) =>
        manualChunks(id, {
          getModuleInfo: () => null,
          getModuleIds: function* () {},
        });

      expect(chunkOf('/repo/node_modules/three/build/three.module.js')).toBe(
        'vendor-three'
      );
      expect(
        chunkOf(
          '/repo/node_modules/three/examples/jsm/postprocessing/GTAOPass.js'
        )
      ).toBe('vendor-three-postfx');
      expect(chunkOf('/repo/node_modules/three-stdlib/index.js')).toBe(
        'vendor-three-postfx'
      );
      expect(chunkOf('/repo/src/engine/fieldstrip/fieldStripSpecs.ts')).toBe(
        'armory-specs'
      );
      expect(
        chunkOf('/repo/src/engine/malfunctions/malfunctionSpecs.ts')
      ).toBe('armory-specs');
      expect(chunkOf('/repo/src/engine/cartridges/cartridgeSpecs.ts')).toBe(
        'armory-specs'
      );
      expect(chunkOf('/repo/src/i18n/uiStrings.ts')).toBe('armory-i18n');
      expect(chunkOf('C:\\repo\\src\\i18n\\weaponFallbacks.ts')).toBe(
        'armory-i18n'
      );
    }

    const ciPath = path.resolve(__dirname, '../.github/workflows/ci.yml');
    const ciText = fs.readFileSync(ciPath, 'utf8');
    expect(ciText).toContain('Vitest full exhibit, physics & V2 contract suite');

    // Verify posterComposer reuses Monograph QR module without duplicate QR encoding logic
    const composerPath = path.resolve(
      __dirname,
      '../src/features/share/posterComposer.ts'
    );
    const composerSource = fs.readFileSync(composerPath, 'utf8');
    expect(composerSource).toContain("from '../monograph/qrCodeSvg'");
    expect(composerSource).not.toContain('0x5412');
  });

  it('enforces 100% zh/en key parity and 0 CJK characters across all English posterShareStrings', () => {
    expect(Object.keys(POSTER_SHARE_STRINGS.en)).toEqual(
      Object.keys(POSTER_SHARE_STRINGS.zh)
    );
    expect(Object.keys(POSTER_SHARE_STRINGS.en.poster)).toEqual(
      Object.keys(POSTER_SHARE_STRINGS.zh.poster)
    );

    const zhStrings = collectStringsFromTree(POSTER_SHARE_STRINGS.zh);
    const enStrings = collectStringsFromTree(POSTER_SHARE_STRINGS.en);

    expect(zhStrings.length).toBeGreaterThan(25);
    expect(enStrings.length).toBe(zhStrings.length);

    for (const s of enStrings) {
      expect(s.trim().length).toBeGreaterThan(0);
      expect(CJK_REGEX.test(s)).toBe(false);
    }

    // Exercise dynamic string formatters explicitly
    const enShareTitle = POSTER_SHARE_STRINGS.en.shareTitle('M4A1 Carbine');
    const enShareText = POSTER_SHARE_STRINGS.en.shareText(
      'M4A1 Carbine',
      'BAY-02'
    );
    const enExploded = POSTER_SHARE_STRINGS.en.poster.modeExploded(65);
    const enParts = POSTER_SHARE_STRINGS.en.poster.partsUnit(26, 4);
    for (const formatted of [
      enShareTitle,
      enShareText,
      enExploded,
      enParts,
    ]) {
      expect(CJK_REGEX.test(formatted)).toBe(false);
    }
  });

  it('computes non-overlapping 1920x1080 (16:9) and 1080x1350 (4:5) poster layouts', () => {
    const aspects: PosterAspectRatio[] = ['16:9', '4:5'];
    for (const aspect of aspects) {
      const layout = computePosterLayout(aspect);
      const expectedDims = POSTER_DIMENSIONS[aspect];
      expect(layout.width).toBe(expectedDims.width);
      expect(layout.height).toBe(expectedDims.height);

      const zones: PosterRect[] = [
        layout.headerRect,
        layout.stageRect,
        layout.identityRect,
        ...layout.metrologyRects,
        layout.curveRect,
        layout.qrRect,
        layout.footerRect,
      ];

      for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        expect(z.w).toBeGreaterThan(40);
        expect(z.h).toBeGreaterThan(20);
        expect(z.x).toBeGreaterThanOrEqual(0);
        expect(z.y).toBeGreaterThanOrEqual(0);
        expect(z.x + z.w).toBeLessThanOrEqual(layout.width);
        expect(z.y + z.h).toBeLessThanOrEqual(layout.height);

        for (let j = i + 1; j < zones.length; j++) {
          expect(rectsOverlap(z, zones[j])).toBe(false);
        }
      }
    }
  });

  it('generates valid poster filenames, metrology, ballistics & scannable ISO 18004 QR matrices for all 23 exhibits (16:9 & 4:5, S/A/B/C rank seals)', () => {
    const ranks: (PosterArmorerRank | null)[] = ['S', 'A', 'B', 'C', null];
    expect(WEAPON_IDS).toHaveLength(23);

    WEAPON_IDS.forEach((weaponId, idx) => {
      expect(buildPosterFilename(weaponId)).toBe(
        `Digital-Armory-3D-${weaponId}-Poster.png`
      );

      const rank = ranks[idx % ranks.length];
      const metaEn = assemblePosterMetadata({
        weaponId,
        lang: 'en',
        activeModes: {
          sectionCut: true,
          xrayShells: idx % 2 === 0,
          engineeringTint: idx % 3 === 0,
          explodeProgress: idx % 2 === 0 ? 0.55 : 0,
          firingMode: idx % 2 === 1,
        },
        armorerRank: rank,
        collectorCallsign: 'ARMORER-01',
        deepLinkOptions: {
          origin: 'https://zhoujingkun1989-arch.github.io',
          baseOverride: '/digital-armory-3d/',
        },
      });

      expect(metaEn.bayCode).toMatch(/^BAY-\d{2}$/);
      expect(metaEn.primaryTitle.length).toBeGreaterThan(2);
      expect(metaEn.secondaryTitle.length).toBeGreaterThan(2);
      // Primary title & mechanism line are strictly English (0 CJK); secondaryTitle is the paired Chinese museum subtitle
      expect(CJK_REGEX.test(metaEn.primaryTitle)).toBe(false);
      expect(CJK_REGEX.test(metaEn.originAndMechanismPrimary)).toBe(false);
      expect(metaEn.metrologyCells).toHaveLength(4);
      for (const cell of metaEn.metrologyCells) {
        expect(CJK_REGEX.test(cell.label)).toBe(false);
        expect(CJK_REGEX.test(cell.value)).toBe(false);
        expect(CJK_REGEX.test(cell.subValue)).toBe(false);
      }
      expect(metaEn.curveSamples.length).toBe(56);
      expect(metaEn.modeBadges[0]?.label).toBe('SECTION-CUT');
      expect(metaEn.armorerRank).toBe(rank);
      expect(metaEn.collectorCallsign).toBe('ARMORER-01');
      expect(metaEn.deepLinkUrl).toBe(
        `https://zhoujingkun1989-arch.github.io/digital-armory-3d/?screen=workbench&weapon=${weaponId}&cut=1`
      );

      // Verify QR matrix matches ISO 18004 encoder output directly & preserves 7x7 finder corners
      const expectedQr = encodeQrMatrix(metaEn.deepLinkUrl);
      expect(metaEn.qrMatrix).toEqual(expectedQr);
      const n = metaEn.qrMatrix.length;
      expect(metaEn.qrMatrix[0][0]).toBe(true);
      expect(metaEn.qrMatrix[0][n - 1]).toBe(true);
      expect(metaEn.qrMatrix[n - 1][0]).toBe(true);

      // Verify Canvas 2D compositing across both 16:9 and 4:5 for every exhibit + rank seal
      for (const aspect of ['16:9', '4:5'] as const) {
        const { canvas, calls } = createMockCanvasAndContext();
        renderPosterToCanvas({
          canvas,
          aspect,
          themeId: 'obsidian_gold',
          lang: 'en',
          metadata: metaEn,
          viewportImage: null,
        });
        expect(canvas.width).toBe(POSTER_DIMENSIONS[aspect].width);
        expect(canvas.height).toBe(POSTER_DIMENSIONS[aspect].height);
        expect(calls.fillRectCount).toBeGreaterThan(100);
        if (rank !== null) {
          expect(
            calls.fillTextLabels.some((lbl) => lbl.includes(rank))
          ).toBe(true);
          expect(calls.fillTextLabels).toContain(
            POSTER_SHARE_STRINGS.en.rankStampHeader
          );
          expect(calls.fillTextLabels).toContain(
            POSTER_SHARE_STRINGS.en.rankTitles[rank]
          );
        }
        // Zero-ellipsis guarantee across all metrology cells & rank seals
        expect(calls.fillTextLabels.some((lbl) => lbl.includes('…'))).toBe(
          false
        );
      }
    });
  });

  it('auto-fits long metrology strings (fitFontToWidth) and blends 1440x900 viewport captures seamlessly across 16:9 & 4:5', () => {
    expect(POSTER_SHARE_STRINGS.zh.rankStampHeader).toBe('军械师资格认证');
    expect(POSTER_SHARE_STRINGS.en.rankStampHeader).toBe('ARMORER CERTIFIED');

    const { canvas: fitCanvas } = createMockCanvasAndContext();
    const fitCtx = fitCanvas.getContext('2d')!;
    const fittedPx = fitFontToWidth(
      fitCtx,
      '.45 ACP (11.43×23mm)',
      210,
      900,
      20,
      10,
      'monospace'
    );
    expect(fittedPx).toBeLessThanOrEqual(20);
    expect(fittedPx).toBeGreaterThanOrEqual(10);
    expect(fitCtx.measureText('.45 ACP (11.43×23mm)').width).toBeLessThanOrEqual(
      210
    );

    const mockViewport = {
      width: 1440,
      height: 900,
    } as unknown as HTMLCanvasElement;

    const vectorMetaEn = assemblePosterMetadata({
      weaponId: 'vector',
      lang: 'en',
      activeModes: {
        sectionCut: true,
        xrayShells: false,
        engineeringTint: false,
        explodeProgress: 0,
        firingMode: false,
      },
      armorerRank: 'B',
    });

    for (const themeId of [
      'obsidian_gold',
      'blueprint_white',
      'cyber_cyan',
    ] as const) {
      for (const aspect of ['16:9', '4:5'] as const) {
        const { canvas, calls } = createMockCanvasAndContext();
        renderPosterToCanvas({
          canvas,
          aspect,
          themeId,
          lang: 'en',
          metadata: vectorMetaEn,
          viewportImage: mockViewport,
        });
        expect(calls.drawImageCount).toBeGreaterThanOrEqual(1);
        expect(calls.fillTextLabels).toContain(
          vectorMetaEn.metrologyCells[0].value
        );
        expect(calls.fillTextLabels).toContain('25 PCS · 4 GROUPS');
        expect(calls.fillTextLabels).toContain('ARMORER CERTIFIED');
        expect(calls.fillTextLabels).toContain('Qualified Armorer');
        expect(calls.fillTextLabels.some((lbl) => lbl.includes('…'))).toBe(
          false
        );
      }
    }
  });

  it('renders high-DPI Canvas 2D posters across all 3 themes & aspect ratios and SSR-renders PosterShareModal cleanly', () => {
    const themes: PosterThemeId[] = [
      'obsidian_gold',
      'blueprint_white',
      'cyber_cyan',
    ];
    const aspects: PosterAspectRatio[] = ['16:9', '4:5'];

    const sampleMeta = assemblePosterMetadata({
      weaponId: 'ak15',
      lang: 'zh',
      activeModes: {
        sectionCut: true,
        xrayShells: true,
        engineeringTint: true,
        explodeProgress: 0.45,
        firingMode: false,
      },
      armorerRank: 'S',
      collectorCallsign: 'CURATOR-88',
      deepLinkOptions: {
        origin: 'https://zhoujingkun1989-arch.github.io',
        baseOverride: '/digital-armory-3d/',
      },
    });

    for (const themeId of themes) {
      expect(POSTER_THEMES[themeId]).toBeDefined();
      for (const aspect of aspects) {
        const { canvas, calls } = createMockCanvasAndContext();
        renderPosterToCanvas({
          canvas,
          aspect,
          themeId,
          lang: 'zh',
          metadata: sampleMeta,
          viewportImage: null,
        });

        expect(canvas.width).toBe(POSTER_DIMENSIONS[aspect].width);
        expect(canvas.height).toBe(POSTER_DIMENSIONS[aspect].height);
        expect(calls.fillRectCount).toBeGreaterThan(100); // QR dark modules + backdrop
        expect(calls.strokeCount).toBeGreaterThan(20);
        expect(
          calls.fillTextLabels.some((lbl) => lbl.includes('BAY-01'))
        ).toBe(true);
      }
    }

    const html = renderToStaticMarkup(
      React.createElement(PosterShareModal, {
        open: true,
        weaponId: 'garand',
        armorerRank: 'S',
      })
    );
    expect(html).toContain('poster-share-dialog');
    expect(html).toContain('1920');
    expect(html).toContain('BAY-16');
  });

  it('reads persisted Armorer Qualification ranks safely and supports imperative modal open/close', () => {
    expect(readSavedArmorerRank('ak15')).toBeNull();

    const prevWindow = globalThis.window;
    const mockStorage = new Map<string, string>();
    mockStorage.set(
      'digital-armory-v2-exam-certs',
      JSON.stringify({
        ak15: { fieldStripRank: 'B', triageRank: 'S' },
        python: { fieldStripRank: 'A', triageRank: 'C' },
      })
    );
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        localStorage: {
          getItem: (k: string) => mockStorage.get(k) ?? null,
        },
      },
    });

    try {
      expect(readSavedArmorerRank('ak15')).toBe('S');
      expect(readSavedArmorerRank('python')).toBe('A');
      expect(readSavedArmorerRank('m4a1')).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: prevWindow,
      });
    }

    openPosterShareModal({ weaponId: 'p90', armorerRank: 'A' });
    const openMarkup = renderToStaticMarkup(
      React.createElement(PosterShareModal)
    );
    expect(openMarkup).toContain('BAY-11');
    closePosterShareModal();
    const closedMarkup = renderToStaticMarkup(
      React.createElement(PosterShareModal)
    );
    expect(closedMarkup).toBe('');
  });
});
