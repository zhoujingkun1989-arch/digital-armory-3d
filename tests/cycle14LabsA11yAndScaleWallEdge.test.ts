import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ScaleWallModal,
  shouldFlipScaleWallLabelInside,
} from '../src/features/scalewall/ScaleWallModal';
import { CommandPaletteModal } from '../src/features/workbench/CommandPaletteModal';

const REPO_ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;
const WP_CODE_RE = /\bWP-\d+[a-z]?\b/i;

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
}

function extractAllMediaBlocks(css: string, headerPattern: RegExp): string {
  const globalRe = new RegExp(headerPattern.source, 'g');
  const chunks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = globalRe.exec(css)) !== null) {
    const openIdx = css.indexOf('{', match.index);
    if (openIdx === -1) break;
    let depth = 0;
    for (let i = openIdx; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          chunks.push(css.slice(openIdx + 1, i));
          globalRe.lastIndex = i + 1;
          break;
        }
      }
    }
  }
  return chunks.join('\n');
}

describe('Cycle 14B · Scale Wall Rightmost Badge Flip, Cmd+K Input Label & 10-Lab Mobile Touch-Target Parity', () => {
  describe('Gem #1 — Scale Wall Rightmost Dimension Chip Left-Anchor (> 82%)', () => {
    it('evaluates shouldFlipScaleWallLabelInside cleanly across boundary values', () => {
      expect(shouldFlipScaleWallLabelInside(0)).toBe(false);
      expect(shouldFlipScaleWallLabelInside(50)).toBe(false);
      expect(shouldFlipScaleWallLabelInside(82)).toBe(false);
      expect(shouldFlipScaleWallLabelInside(82.01)).toBe(true);
      expect(shouldFlipScaleWallLabelInside(85)).toBe(true);
      expect(shouldFlipScaleWallLabelInside(90.83)).toBe(true);
      expect(shouldFlipScaleWallLabelInside(100)).toBe(true);
      expect(shouldFlipScaleWallLabelInside(Number.NaN)).toBe(false);
      expect(shouldFlipScaleWallLabelInside(Number.POSITIVE_INFINITY)).toBe(
        false
      );
    });

    it('SSR marks ZTZ-99A dimension badge inside-left and short exhibits outside-right, with dark & daylight CSS rules', () => {
      const html = renderToStaticMarkup(
        React.createElement(ScaleWallModal, {
          onClose: () => undefined,
        })
      );
      expect(html).toContain('data-testid="scalewall-lane-ztz99a"');
      expect(html).toContain('sw-dim-callout tabular is-label-inside');
      expect(html).toContain('data-label-anchor="inside-left"');
      expect(html).toContain('data-label-anchor="outside-right"');

      const css = readRepoFile('src/styles/scale-wall.css');
      expect(css).toMatch(
        /\.sw-dim-callout\.is-label-inside\s*\{[^}]*position:\s*absolute[^}]*right:\s*calc\(100%\s*-\s*var\(--sw-bar-pct/s
      );
      expect(css).toMatch(
        /:is\(\[data-theme='light'\],\s*\.theme-light\)\s*\.sw-dim-callout\.is-label-inside/
      );
    });
  });

  describe('WCAG 4.1.2 — Command Palette Search Input Accessible Name', () => {
    it('provides an explicit bilingual aria-label on input.cmdk-search-input with 0 CJK in EN', () => {
      const tsx = readRepoFile(
        'src/features/workbench/CommandPaletteModal.tsx'
      );
      const enMatch = tsx.match(
        /aria-label=\{\s*lang === 'zh'\s*\?\s*`([^`]+)`\s*:\s*`([^`]+)`\s*\}/
      );
      expect(enMatch).not.toBeNull();
      const zhLabel = enMatch![1];
      const enLabel = enMatch![2];
      expect(zhLabel.length).toBeGreaterThan(6);
      expect(enLabel.length).toBeGreaterThan(10);
      expect(enLabel).not.toMatch(CJK_RE);
      expect(enLabel).not.toMatch(WP_CODE_RE);

      const html = renderToStaticMarkup(
        React.createElement(CommandPaletteModal, { forceOpen: true })
      );
      expect(html).toMatch(/<input[^>]*class="cmdk-search-input"[^>]*aria-label="[^"]*100[^"]*2,174[^"]*"/);
    });
  });

  describe('WCAG 2.5.8 — Mobile (<= 768px) >= 32px Touch-Target Parity Across All 10 Owned Stylesheets', () => {
    const expectations: ReadonlyArray<{
      file: string;
      selectors: readonly string[];
    }> = [
      {
        file: 'src/styles/showcase.css',
        selectors: [
          '.showcase-brand',
          '.showcase-nav .lang-seg-btn',
          '.showcase-launch-pill',
          '.stage-mode-btn',
          '.stage-carousel-arrow',
          '.stage-weapon-pill',
          '.doc-weapon-pill',
          '.gallery-launch-link',
          '.qs-copy-btn',
        ],
      },
      {
        file: 'src/styles/external-ballistics.css',
        selectors: [
          '.eb-reset-btn',
          '.eb-range3d-string5-btn',
          '.eb-quick-zero-btn',
          '.eb-spin-toggle-btn',
          '.eb-controls-toggle-btn',
          '.eb-weapon-link-pill',
        ],
      },
      {
        file: 'src/styles/scale-wall.css',
        selectors: [
          '.sw-split-cta',
          '.sw-seg-btn',
          '.sw-inspect-btn',
          '.sw-remove-btn',
          '.sw-pick-chip',
        ],
      },
      {
        file: 'src/styles/recoil-lab.css',
        selectors: ['.rl-split-cta', '.rl-inspect-mini', '.rl-pill-btn'],
      },
      {
        file: 'src/styles/offline-museum.css',
        selectors: ['.offline-btn', '.offline-close-btn', '.offline-item-btn'],
      },
      {
        file: 'src/styles/poster-share.css',
        selectors: [
          '.poster-share-dialog .lang-seg-btn',
          '.ps-rank-pill',
          '.ps-exhibit-pill',
        ],
      },
      {
        file: 'src/styles/timeline-museum.css',
        selectors: ['.timeline-era-pill', '.timeline-ancestor-chip'],
      },
      {
        file: 'src/styles/passport.css',
        selectors: ['.passport-filter-pill'],
      },
      {
        file: 'src/styles/armor-penetration.css',
        selectors: ['.armor-theater-cam-btn', '.armor-theater-speed-btn'],
      },
      {
        file: 'src/styles/command-palette.css',
        selectors: ['.cmdk-esc-btn', '.cmdk-clear-btn'],
      },
    ];

    for (const { file, selectors } of expectations) {
      it(`enforces >= 32px mobile touch dimensions in ${file}`, () => {
        const css = readRepoFile(file);
        const mobileBlock = extractAllMediaBlocks(
          css,
          /@media\s*\(\s*max-width:\s*768px\s*\)/
        );
        expect(mobileBlock.length).toBeGreaterThan(0);

        for (const sel of selectors) {
          expect(mobileBlock).toContain(sel);
        }

        const minHMatches = [...mobileBlock.matchAll(/min-height:\s*(\d+)px/g)];
        const minWMatches = [...mobileBlock.matchAll(/min-width:\s*(\d+)px/g)];
        expect(minHMatches.some((m) => Number(m[1]) >= 32)).toBe(true);
        expect(minWMatches.some((m) => Number(m[1]) >= 32)).toBe(true);
      });
    }
  });
});
