import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EXTERNAL_BALLISTICS_STRINGS } from '../src/features/ballistics/externalBallisticsStrings';
import { ScaleWallModal } from '../src/features/scalewall/ScaleWallModal';
import {
  SCALE_WALL_PRESETS,
  SCALE_WALL_STRINGS,
} from '../src/features/scalewall/scaleWallSpecs';

const REPO_ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;
const WP_CODE_RE = /\bWP-\d+[a-z]?\b/i;

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
}

/**
 * Extract the inner body of a CSS at-rule block (e.g. `@media (max-width: 768px)`
 * or `@container (width < 640px)`) with brace-depth balancing.
 */
function extractAtRuleBlock(css: string, headerPattern: RegExp): string {
  const match = headerPattern.exec(css);
  if (!match) return '';
  const openIdx = css.indexOf('{', match.index);
  if (openIdx === -1) return '';
  let depth = 0;
  for (let i = openIdx; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return css.slice(openIdx + 1, i);
      }
    }
  }
  return '';
}

function stripAtRuleBlock(css: string, headerPattern: RegExp): string {
  const match = headerPattern.exec(css);
  if (!match) return css;
  const openIdx = css.indexOf('{', match.index);
  if (openIdx === -1) return css;
  let depth = 0;
  for (let i = openIdx; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return css.slice(0, match.index) + css.slice(i + 1);
      }
    }
  }
  return css;
}

describe('Cycle 12C · Labs Visual Audit Pinpoint Fixes (#172 #5, #6, #8, #10)', () => {
  describe('Fix #5 — Scale Wall Desktop Clipping, Ruler Spacing & Mobile Collapse', () => {
    const scaleWallCss = readRepoFile('src/styles/scale-wall.css');
    const mobile768Block = extractAtRuleBlock(
      scaleWallCss,
      /@media\s*\(\s*max-width:\s*768px\s*\)/
    );
    const desktopCss = stripAtRuleBlock(
      scaleWallCss,
      /@media\s*\(\s*max-width:\s*768px\s*\)/
    );

    it('prevents flex-shrink collapse on blueprint stage, metrics panel, and vault picker', () => {
      const stageMatch = desktopCss.match(/\.sw-blueprint-stage\s*\{([^}]*)\}/);
      expect(stageMatch).not.toBeNull();
      const stageBody = stageMatch![1];
      expect(stageBody).toMatch(/flex-shrink:\s*0/);
      const minHeightMatch = stageBody.match(/min-height:\s*(\d+)px/);
      expect(minHeightMatch).not.toBeNull();
      expect(Number(minHeightMatch![1])).toBeGreaterThanOrEqual(300);

      const metricsMatch = desktopCss.match(/\.sw-metrics-panel\s*\{([^}]*)\}/);
      expect(metricsMatch).not.toBeNull();
      expect(metricsMatch![1]).toMatch(/flex-shrink:\s*0/);

      const pickerMatch = desktopCss.match(/\.sw-picker-section\s*\{([^}]*)\}/);
      expect(pickerMatch).not.toBeNull();
      expect(pickerMatch![1]).toMatch(/flex-shrink:\s*0/);
    });

    it('adds >= 12px right padding to ruler and lane labels so text never kisses the 0 tick', () => {
      const rulerMetaMatch = desktopCss.match(/\.sw-ruler-meta\s*\{([^}]*)\}/);
      expect(rulerMetaMatch).not.toBeNull();
      const rulerPad = rulerMetaMatch![1].match(/padding-right:\s*(\d+)px/);
      expect(rulerPad).not.toBeNull();
      expect(Number(rulerPad![1])).toBeGreaterThanOrEqual(12);

      const laneMetaMatch = desktopCss.match(/\.sw-lane-meta\s*\{([^}]*)\}/);
      expect(laneMetaMatch).not.toBeNull();
      const lanePad = laneMetaMatch![1].match(/padding-right:\s*(\d+)px/);
      expect(lanePad).not.toBeNull();
      expect(Number(lanePad![1])).toBeGreaterThanOrEqual(12);
    });

    it('keeps mobile blueprint grid expanded (>= 220px) with horizontal scroll inner track and non-collapsing preset strip', () => {
      expect(mobile768Block.length).toBeGreaterThan(0);

      const mobileStage = mobile768Block.match(/\.sw-blueprint-stage\s*\{([^}]*)\}/);
      expect(mobileStage).not.toBeNull();
      expect(mobileStage![1]).toMatch(/flex-shrink:\s*0/);
      expect(mobileStage![1]).toMatch(/overflow-x:\s*auto/);
      const mobileMinH = mobileStage![1].match(/min-height:\s*(\d+)px/);
      expect(mobileMinH).not.toBeNull();
      expect(Number(mobileMinH![1])).toBeGreaterThanOrEqual(220);

      const mobileInner = mobile768Block.match(
        /\.sw-blueprint-scroll-inner\s*\{([^}]*)\}/
      );
      expect(mobileInner).not.toBeNull();
      const minW = mobileInner![1].match(/min-width:\s*(\d+)px/);
      expect(minW).not.toBeNull();
      expect(Number(minW![1])).toBeGreaterThanOrEqual(500);

      const mobileRulerLane = mobile768Block.match(
        /\.sw-ruler-row,\s*\.sw-lane\s*\{([^}]*)\}/
      );
      expect(mobileRulerLane).not.toBeNull();
      expect(mobileRulerLane![1]).not.toMatch(/grid-template-columns:\s*1fr\s*;/);

      const mobilePresets = mobile768Block.match(/\.sw-presets-group\s*\{([^}]*)\}/);
      expect(mobilePresets).not.toBeNull();
      expect(mobilePresets![1]).toMatch(/flex-shrink:\s*0/);
    });

    it('SSR renders sw-blueprint-scroll-inner containing all 5 default exhibits and keeps EN copy 0-CJK / 0-WP', () => {
      const defaultExhibits = SCALE_WALL_PRESETS[0].weaponIds;
      expect(defaultExhibits).toHaveLength(5);

      const html = renderToStaticMarkup(
        React.createElement(ScaleWallModal, {
          onClose: () => undefined,
        })
      );
      expect(html).toContain('data-testid="scalewall-blueprint-grid"');
      expect(html).toContain('class="sw-blueprint-scroll-inner"');
      expect(html).toContain('data-testid="scalewall-reference-lane"');
      for (const id of defaultExhibits) {
        expect(html).toContain(`data-testid="scalewall-lane-${id}"`);
      }
      expect(html).not.toMatch(WP_CODE_RE);

      const enStrings = SCALE_WALL_STRINGS.en;
      expect(enStrings.title).not.toMatch(CJK_RE);
      expect(enStrings.subtitle).not.toMatch(CJK_RE);
      expect(enStrings.rulerCaption('1 m')).not.toMatch(CJK_RE);
      expect(enStrings.rulerCaption('1 m')).not.toMatch(WP_CODE_RE);
    });
  });

  describe('Fix #6 — Cartridge Comparison Matrix Desktop SD Cell Deduplication', () => {
    const cartridgesCss = readRepoFile('src/styles/cartridges.css');
    const containerMobileBlock = extractAtRuleBlock(
      cartridgesCss,
      /@container\s*\(\s*width\s*<\s*640px\s*\)/
    );
    const nonContainerCss = stripAtRuleBlock(
      cartridgesCss,
      /@container\s*\(\s*width\s*<\s*640px\s*\)/
    );

    it('never attaches ::before column labels to td[data-col="sd"] (or any matrix td) on desktop widths', () => {
      expect(nonContainerCss).not.toMatch(
        /\.cartridge-comparison-table\s+td\[data-col=['"]sd['"]\]::before/
      );
      expect(nonContainerCss).not.toMatch(
        /\.cartridge-comparison-table\s+td\[data-col=[^\]]+\]::before/
      );
    });

    it('scopes td[data-col="sd"]::before strictly inside @container (width < 640px) with spacing gap', () => {
      expect(containerMobileBlock.length).toBeGreaterThan(0);
      expect(containerMobileBlock).toMatch(
        /\.cartridge-comparison-table\s+td\[data-col=['"]sd['"]\]::before\s*\{[^}]*content:\s*var\(--col-sd/
      );

      const tdBeforeMatch = containerMobileBlock.match(
        /\.cartridge-comparison-table\s+td::before\s*\{([^}]*)\}/
      );
      expect(tdBeforeMatch).not.toBeNull();
      const marginRight = tdBeforeMatch![1].match(/margin-right:\s*(\d+)px/);
      expect(marginRight).not.toBeNull();
      expect(Number(marginRight![1])).toBeGreaterThanOrEqual(6);
    });

    it('widens desktop .cartridge-matrix-panel so all 10 columns fit without right-edge clipping', () => {
      const panelMatch = nonContainerCss.match(
        /\.cartridge-matrix-panel\s*\{([^}]*)\}/
      );
      expect(panelMatch).not.toBeNull();
      const widthMatch = panelMatch![1].match(/width:\s*min\((\d+)px/);
      expect(widthMatch).not.toBeNull();
      expect(Number(widthMatch![1])).toBeGreaterThanOrEqual(1000);
    });

    it('keeps CartridgeLabView td[data-col="sd"] cell markup purely numeric without hardcoded label prefix', () => {
      const labTsx = readRepoFile('src/features/cartridges/CartridgeLabView.tsx');
      const sdCellMatch = labTsx.match(
        /<td\s+data-col="sd"[^>]*>([\s\S]*?)<\/td>/
      );
      expect(sdCellMatch).not.toBeNull();
      expect(sdCellMatch![1]).toContain('sd.metricGCm2.toFixed(1)');
      expect(sdCellMatch![1]).toContain('sd.imperialLbIn2.toFixed(3)');
      expect(sdCellMatch![1]).not.toMatch(/SD\s*\(/i);
    });
  });

  describe('Fix #8 — EN External Ballistics Single-Row Header Subtitle', () => {
    it('tightens EN subtitle to <= 62 chars with zero CJK and zero WP-XX tokens', () => {
      const { en } = EXTERNAL_BALLISTICS_STRINGS;
      expect(en.subtitle).toBe(
        'RK4 3-DOF Solver · G1/G7 Wave Drag · FFP Reticle & DOPE'
      );
      expect(en.subtitle.length).toBeLessThanOrEqual(62);
      expect(en.subtitle).not.toMatch(CJK_RE);
      expect(en.subtitle).not.toMatch(WP_CODE_RE);
      expect(en.title).not.toMatch(CJK_RE);
      expect(en.badge).not.toMatch(CJK_RE);
    });
  });

  describe('Fix #10 — Mobile Recoil Lab Preset Pill Touch Height & Non-Clipping Flex', () => {
    const recoilCss = readRepoFile('src/styles/recoil-lab.css');
    const mobile768Block = extractAtRuleBlock(
      recoilCss,
      /@media\s*\(\s*max-width:\s*768px\s*\)/
    );

    it('prevents flex-shrink vertical clipping on .recoillab-header and .rl-presets-bar', () => {
      const headerMatch = recoilCss.match(/\.recoillab-header\s*\{([^}]*)\}/);
      expect(headerMatch).not.toBeNull();
      expect(headerMatch![1]).toMatch(/flex-shrink:\s*0/);

      const barMatch = recoilCss.match(/\.rl-presets-bar\s*\{([^}]*)\}/);
      expect(barMatch).not.toBeNull();
      expect(barMatch![1]).toMatch(/flex-shrink:\s*0/);
    });

    it('gives mobile .rl-preset-pill auto height, >= 44px min-height, 8px 12px padding, and 1.35 line-height', () => {
      expect(mobile768Block.length).toBeGreaterThan(0);

      const mobileBar = mobile768Block.match(/\.rl-presets-bar\s*\{([^}]*)\}/);
      expect(mobileBar).not.toBeNull();
      expect(mobileBar![1]).toMatch(/flex-shrink:\s*0/);
      expect(mobileBar![1]).toMatch(/overflow-x:\s*auto/);

      const mobilePill = mobile768Block.match(/\.rl-preset-pill\s*\{([^}]*)\}/);
      expect(mobilePill).not.toBeNull();
      expect(mobilePill![1]).toMatch(/height:\s*auto/);
      const minH = mobilePill![1].match(/min-height:\s*(\d+)px/);
      expect(minH).not.toBeNull();
      expect(Number(minH![1])).toBeGreaterThanOrEqual(44);
      expect(mobilePill![1]).toMatch(/padding:\s*8px\s+12px/);
      expect(mobilePill![1]).toMatch(/line-height:\s*1\.35/);
    });
  });
});
