import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  assemblePosterMetadata,
  formatPosterRiflingMetrology,
  renderPosterToCanvas,
} from '../src/features/share/posterComposer';
import { PosterShareModal } from '../src/features/share/PosterShareModal';
import { useAppStore } from '../src/store/useAppStore';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';
import type { WeaponId } from '../src/weapons/types';

const REPO_ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const WP_LEAK_RE = /\bWP-\d+[a-z]?\b/i;

function withSsrLang<T>(lang: 'zh' | 'en', fn: () => T): T {
  const initialState = useAppStore.getInitialState() as unknown as Record<
    string,
    unknown
  >;
  const prevInitialLang = initialState.lang;
  const prevLiveLang = useAppStore.getState().lang;
  initialState.lang = lang;
  useAppStore.setState({ lang });
  try {
    return fn();
  } finally {
    initialState.lang = prevInitialLang;
    useAppStore.setState({ lang: prevLiveLang });
  }
}

function stripLangSwitchPill(html: string): string {
  return html.replace(
    /<div[^>]*class="[^"]*lang-switch-pill[^"]*"[^>]*>[\s\S]*?<\/div>/g,
    ''
  );
}

function createMockPosterCanvas() {
  const fillTextLabels: string[] = [];
  let currentFontSize = 12;

  const ctx = {
    font: '12px sans-serif',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    quadraticCurveTo: () => undefined,
    arc: () => undefined,
    clip: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    clearRect: () => undefined,
    setLineDash: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    scale: () => undefined,
    drawImage: () => undefined,
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    measureText: (text: string) => {
      const m = String(ctx.font).match(/(\d+(?:\.\d+)?)px/);
      currentFontSize = m ? Number(m[1]) : 12;
      return { width: text.length * currentFontSize * 0.56 };
    },
    fillText: (text: string) => {
      fillTextLabels.push(String(text));
    },
  };

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;

  return { canvas, fillTextLabels };
}

describe('Cycle 18B — HD Share Poster Rifling Metrology & Modernized CONTRIBUTING.md', () => {
  it('formats authentic Bore & Rifling / Compound Cam metrology for m1911, g17, ztz99a, gau8 & lift33 across EN and ZH', () => {
    const m1911En = formatPosterRiflingMetrology('m1911', 'en');
    expect(m1911En.kind).toBe('cut_rifled');
    expect(m1911En.stampLabel).toContain('Ø11.43mm');
    expect(m1911En.stampLabel).toContain('6G');
    expect(m1911En.stampLabel).toContain('1:16"');
    expect(m1911En.stampLabel).toContain('406mm');
    expect(m1911En.stampLabel).toContain('LH');
    expect(m1911En.principlesLabel).toContain('PRINCIPLES');
    expect(CJK_RE.test(m1911En.stampLabel)).toBe(false);
    expect(CJK_RE.test(m1911En.principlesLabel)).toBe(false);

    const m1911Zh = formatPosterRiflingMetrology('m1911', 'zh');
    expect(m1911Zh.stampLabel).toContain('左旋');
    expect(m1911Zh.stampLabel).toContain('6条');

    const g17En = formatPosterRiflingMetrology('g17', 'en');
    expect(g17En.kind).toBe('polygonal');
    expect(g17En.stampLabel).toContain('Ø9mm');
    expect(g17En.stampLabel).toContain('6-POLYGONAL');
    expect(g17En.stampLabel).toContain('250mm');
    expect(g17En.stampLabel).toContain('RH');

    const ztzEn = formatPosterRiflingMetrology('ztz99a', 'en');
    expect(ztzEn.kind).toBe('smoothbore');
    expect(ztzEn.stampLabel).toContain('Ø125mm');
    expect(ztzEn.stampLabel).toContain('SMOOTHBORE');
    expect(ztzEn.stampLabel).toContain('HARD-CHROME');

    const gau8En = formatPosterRiflingMetrology('gau8', 'en');
    expect(gau8En.kind).toBe('cut_rifled');
    expect(gau8En.stampLabel).toContain('Ø30mm');
    expect(gau8En.stampLabel).toContain('9G');
    expect(gau8En.stampLabel).toContain('1000mm');
    expect(gau8En.stampLabel).toContain('CHROME');

    const liftEn = formatPosterRiflingMetrology('lift33', 'en');
    expect(liftEn.kind).toBe('none');
    expect(liftEn.stampLabel).toContain('COMPOUND CAM');
    expect(liftEn.stampLabel).not.toContain('BORE');
    expect(liftEn.stampLabel).not.toContain('Ø0');

    const r500En = formatPosterRiflingMetrology('r500', 'en');
    expect(r500En.kind).toBe('none');
    expect(r500En.stampLabel).toContain('HELICAL CAM');
    expect(r500En.stampLabel).not.toContain('BORE');
  });

  it('covers all 34/34 exhibits with zero EN CJK and zero WP-XX leaks and renders stamps on 16:9 & 4:5 Smithsonian/Obsidian posters', () => {
    expect(WEAPON_MANIFESTS.length).toBe(34);
    for (const manifest of WEAPON_MANIFESTS) {
      const enSpec = formatPosterRiflingMetrology(manifest.id, 'en');
      const zhSpec = formatPosterRiflingMetrology(manifest.id, 'zh');
      expect(enSpec.stampLabel.length).toBeGreaterThan(8);
      expect(zhSpec.stampLabel.length).toBeGreaterThan(6);
      expect(enSpec.principlesLabel.length).toBeGreaterThan(8);
      expect(zhSpec.principlesLabel.length).toBeGreaterThan(6);
      expect(CJK_RE.test(enSpec.stampLabel), manifest.id).toBe(false);
      expect(CJK_RE.test(enSpec.detailLabel), manifest.id).toBe(false);
      expect(CJK_RE.test(enSpec.principlesLabel), manifest.id).toBe(false);
      expect(WP_LEAK_RE.test(enSpec.stampLabel), manifest.id).toBe(false);
      expect(WP_LEAK_RE.test(zhSpec.stampLabel), manifest.id).toBe(false);
    }

    const showcaseIds: WeaponId[] = ['m1911', 'g17', 'ztz99a', 'gau8', 'lift33'];
    for (const weaponId of showcaseIds) {
      const meta = assemblePosterMetadata({
        weaponId,
        lang: 'en',
        activeModes: {
          sectionCut: true,
          xrayShells: false,
          engineeringTint: false,
          explodeProgress: 0,
          firingMode: false,
        },
        armorerRank: 'S',
      });

      for (const themeId of ['smithsonian_blueprint', 'obsidian_gold'] as const) {
        for (const aspect of ['16:9', '4:5'] as const) {
          const { canvas, fillTextLabels } = createMockPosterCanvas();
          renderPosterToCanvas({
            canvas,
            aspect,
            themeId,
            lang: 'en',
            metadata: meta,
            viewportImage: null,
          });
          expect(fillTextLabels).toContain(meta.riflingMetrology.stampLabel);
          expect(fillTextLabels).toContain(
            meta.riflingMetrology.principlesLabel
          );
          expect(
            fillTextLabels.some((lbl) => lbl.includes('…')),
            `${weaponId} ${themeId} ${aspect}: unexpected ellipsis`
          ).toBe(false);
        }
      }
    }
  });

  it('exposes the bore/rifling stamp inside PosterShareModal SSR with zero EN CJK and preserves WCAG dialog semantics', () => {
    const htmlEn = withSsrLang('en', () =>
      renderToStaticMarkup(
        React.createElement(PosterShareModal, {
          open: true,
          weaponId: 'm1911',
          armorerRank: 'S',
        })
      )
    );
    expect(htmlEn).toContain('role="dialog"');
    expect(htmlEn).toContain('aria-modal="true"');
    expect(htmlEn).toContain('data-testid="poster-rifling-stamp"');
    expect(htmlEn).toContain('Ø11.43mm');
    expect(htmlEn).toContain('LH');
    expect(CJK_RE.test(stripLangSwitchPill(htmlEn))).toBe(false);

    const archeryEn = withSsrLang('en', () =>
      renderToStaticMarkup(
        React.createElement(PosterShareModal, {
          open: true,
          weaponId: 'lift33',
        })
      )
    );
    expect(archeryEn).toContain('COMPOUND CAM');
    expect(CJK_RE.test(stripLangSwitchPill(archeryEn))).toBe(false);

    // Zero WP-XX leaks in owned poster source files
    for (const rel of [
      'src/features/share/posterComposer.ts',
      'src/features/share/PosterShareModal.tsx',
    ]) {
      const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect(WP_LEAK_RE.test(src), `${rel} contains WP-XX`).toBe(false);
    }
  });

  it('keeps CONTRIBUTING.md synchronized with package.json CI/QA scripts and non-negotiable engineering invariants', () => {
    const contributing = fs.readFileSync(
      path.join(REPO_ROOT, 'CONTRIBUTING.md'),
      'utf8'
    );
    const pkg = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> };

    const requiredScripts = [
      'typecheck',
      'lint',
      'test',
      'build',
      'assets:audit',
      'qa:visual',
      'qa:perf',
      'qa:fleet',
      'qa:subpath',
      'qa:a11y',
      'docs:screenshots',
    ];
    for (const scriptName of requiredScripts) {
      expect(
        pkg.scripts[scriptName],
        `package.json missing script: ${scriptName}`
      ).toBeTruthy();
      const expectedCmd =
        scriptName === 'test' ? 'npm test' : `npm run ${scriptName}`;
      expect(
        contributing,
        `CONTRIBUTING.md missing command: ${expectedCmd}`
      ).toContain(expectedCmd);
    }

    const requiredInvariants = [
      '34 exhibits',
      '10 halls',
      '854 parts',
      '1 world unit = 1 cm',
      'Zero-GC',
      'useFrame',
      'lockLinearTextureColorSpace',
      '<= 12 MB',
      '< 800 kB',
      'resolvePublicAssetUrl',
      '/digital-armory-3d/',
      'Charon',
      'gemini-3.8-flash-tts',
      'WCAG 2.1 AA',
      '简体中文指南',
    ];
    for (const token of requiredInvariants) {
      expect(contributing, `CONTRIBUTING.md missing: ${token}`).toContain(
        token
      );
    }

    expect(WP_LEAK_RE.test(contributing)).toBe(false);
  });
});
