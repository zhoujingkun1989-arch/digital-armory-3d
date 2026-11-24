import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const STYLES_DIR = path.join(REPO_ROOT, 'src/styles');

const NON_INTERACTIVE_EXCLUDED_STYLES = new Set([
  'base.css',
  'index.css',
  'tokens.css',
  'showcase.css',
]);

const CYCLE_8C_UPGRADED_FILES: Readonly<Record<string, readonly string[]>> = {
  'poster-share.css': [
    '.poster-share-dialog',
    '.ps-studio-header',
    '.ps-controls-rail',
    '.ps-preview-stage',
  ],
  'gpu-telemetry.css': [
    '.gpu-telemetry-hud',
    '.gpu-telemetry-kpi',
    '.gpu-telemetry-tier-pill',
  ],
  'split-showdown.css': [
    '.split-topbar',
    '.split-plaque',
    '.split-vs-medallion',
    '.split-btn.is-active',
  ],
  'split-showdown-upgrade.css': [
    '.split-plaque',
    '.split-bottom-dock',
    '.split-divider-line',
  ],
  'dk-monograph.css': ['.dk-monograph', '.dk-spread-sheet', '.dk-page-sheet'],
  'monograph.css': [
    '.monograph-dialog',
    '.monograph-studio-header',
    '.monograph-preview-stage',
  ],
  'callout.css': [
    '.editorial-callout-label',
    '.editorial-callout-label.selected',
    '.callout-svg-layer',
  ],
  'external-ballistics.css': [
    '.eb-header',
    '.eb-control-panel',
    '.eb-dope-table',
  ],
  'director-reel.css': [
    '.director-reel-shell',
    '.director-reel-exhibit-pill',
    '.director-reel-preset-card',
  ],
  'tank-crew.css': [
    '.tank-crew-hud',
    '.tank-crew-icon-btn',
    '.tank-crew-lase-btn',
  ],
  'responsive.css': [
    '.inspector-card.firing-compact-card',
    '.live-section-bar',
    '.timeline-dock',
    '.armory-drawer-panel',
  ],
};

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function assertBalancedBraces(css: string, fileName: string): void {
  const clean = stripCssComments(css);
  let depth = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      expect(depth, `${fileName} has unmatched closing brace`).toBeGreaterThanOrEqual(
        0
      );
    }
  }
  expect(depth, `${fileName} has unclosed CSS block`).toBe(0);
}

describe('Cycle 8C · Full Blueprint Daylight ([data-theme="light"]) Museum Theme Parity', () => {
  it('verifies every interactive workbench/lab/modal stylesheet in src/styles/ has substantive [data-theme="light"] rules and balanced CSS braces', () => {
    const allCssFiles = fs
      .readdirSync(STYLES_DIR)
      .filter((f) => f.endsWith('.css'))
      .sort();

    const interactiveFiles = allCssFiles.filter(
      (f) => !NON_INTERACTIVE_EXCLUDED_STYLES.has(f)
    );
    expect(interactiveFiles.length).toBeGreaterThanOrEqual(24);

    for (const fileName of interactiveFiles) {
      const css = fs.readFileSync(path.join(STYLES_DIR, fileName), 'utf8');
      assertBalancedBraces(css, fileName);

      const lightMatches = css.match(/\[data-theme=['"]light['"]\]/g) ?? [];
      expect(
        lightMatches.length,
        `${fileName} should define substantive [data-theme='light'] Blueprint Daylight rules (found ${lightMatches.length})`
      ).toBeGreaterThanOrEqual(4);
    }
  });

  it('verifies exact Blueprint Daylight selectors across all 11 upgraded Cycle 8C stylesheets', () => {
    for (const [fileName, expectedSelectors] of Object.entries(
      CYCLE_8C_UPGRADED_FILES
    )) {
      const css = fs.readFileSync(path.join(STYLES_DIR, fileName), 'utf8');
      const lightIndex = css.indexOf("[data-theme='light']");
      expect(lightIndex, `${fileName} missing [data-theme='light']`).toBeGreaterThan(
        -1
      );

      for (const selector of expectedSelectors) {
        const escapedSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lightRuleRe = new RegExp(
          `\\[data-theme=['"]light['"]\\][\\s\\S]{0,420}${escapedSel}`,
          'm'
        );
        expect(
          css,
          `${fileName} missing Blueprint Daylight override for ${selector}`
        ).toMatch(lightRuleRe);
      }
    }
  });

  it('preserves dark-theme defaults, print media isolation, FLIR optics, and prefers-reduced-motion guards intact', () => {
    const monographCss = fs.readFileSync(
      path.join(STYLES_DIR, 'monograph.css'),
      'utf8'
    );
    const dkCss = fs.readFileSync(
      path.join(STYLES_DIR, 'dk-monograph.css'),
      'utf8'
    );
    const splitCss = fs.readFileSync(
      path.join(STYLES_DIR, 'split-showdown.css'),
      'utf8'
    );
    const ebCss = fs.readFileSync(
      path.join(STYLES_DIR, 'external-ballistics.css'),
      'utf8'
    );
    const tankCss = fs.readFileSync(
      path.join(STYLES_DIR, 'tank-crew.css'),
      'utf8'
    );
    const gpuCss = fs.readFileSync(
      path.join(STYLES_DIR, 'gpu-telemetry.css'),
      'utf8'
    );

    // Print stylesheets remain completely intact
    expect(monographCss).toContain('@media print');
    expect(dkCss).toContain('@media print');

    // Reduced-motion guards remain intact
    expect(splitCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(ebCss).toContain('@media (prefers-reduced-motion: reduce)');

    // Dark theme defaults preserved intact
    expect(monographCss).toContain('background: #0b1018;');
    expect(gpuCss).toContain('background: rgba(11, 16, 24, 0.84);');
    expect(splitCss).toContain('background: rgba(9, 13, 22, 0.78);');

    // Tank FLIR optical eyepiece stays dark/authentic while HUD adapts
    expect(tankCss).toContain(".canvas-container[data-flir-optic='whot'] canvas");
    expect(tankCss).toContain('.tank-gunner-reticle-overlay.is-flir_whot');

    // Zero WP-XX developer tags introduced in upgraded split-showdown.css
    expect(splitCss).not.toMatch(/\bWP-\d+\b/);
  });
});
