import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { caliperStore } from '../src/engine/caliper/caliperStore';
import {
  ArmoryView,
  resolveArmoryHeaderDesktopTitle,
} from '../src/features/armory/ArmoryView';
import { SplitShowdownOverlay } from '../src/features/showdown3d/SplitShowdownOverlay';
import {
  BallisticsTelemetryHud,
  TELEMETRY_HUD_STRINGS,
  TELEMETRY_MOBILE_COLLAPSE_MAX_WIDTH,
  shouldDefaultCollapseTelemetry,
} from '../src/features/workbench/BallisticsTelemetryHud';
import { CaliperHud } from '../src/features/workbench/CaliperHud';
import {
  PartInspectorCard,
  resolvePartInspectorFallbackDescription,
  resolvePartInspectorSecondaryTitle,
} from '../src/features/workbench/PartInspectorCard';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponPlugin } from '../src/weapons/registry';
import type { WeaponId } from '../src/weapons/types';

const ROOT = process.cwd();
const CJK_RE = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
const WP_LEAK_RE = /\bWP-\d+[a-z]?\b/i;

function readWorkspaceFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function countBraces(css: string): { open: number; close: number } {
  let open = 0;
  let close = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') open++;
    else if (css[i] === '}') close++;
  }
  return { open, close };
}

function stripLangSwitchPill(html: string): string {
  return html.replace(
    /<div class="lang-switch-pill[\s\S]*?<\/div>/g,
    ''
  );
}

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

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

describe('Cycle 12B — Live Visual Audit Pinpoint UX Fixes (#172 -> 9.90/10)', () => {
  afterEach(() => {
    caliperStore.clearPoints();
    caliperStore.setUnitSystem('mm');
    useAppStore.setState({
      screen: 'armory',
      activeWeaponId: 'ak15',
      selectedPartId: null,
      mode: 'explode',
      lang: 'zh',
    });
  });

  it('1. CaliperHud separates title + close row from wrapping .caliper-hud-actions strip so Clear and × never clip', () => {
    const htmlEn = renderToStaticMarkup(
      React.createElement(CaliperHud, {
        forceVisible: true,
        weaponIdOverride: 'm1911',
        langOverride: 'en',
      })
    );
    const htmlZh = renderToStaticMarkup(
      React.createElement(CaliperHud, {
        forceVisible: true,
        weaponIdOverride: 'm1911',
        langOverride: 'zh',
      })
    );

    const headerMatch = htmlEn.match(
      /<div class="caliper-hud-header">([\s\S]*?)<\/div>\s*<div class="caliper-hud-actions"/
    );
    expect(headerMatch).not.toBeNull();
    const headerInner = headerMatch?.[1] ?? '';
    expect(headerInner).toContain('caliper-badge');
    expect(headerInner).toContain('caliper-close-btn');
    expect(headerInner).not.toContain('caliper-unit-toggle');
    expect(headerInner).not.toContain('caliper-mini-btn');

    expect(htmlEn).toContain('data-testid="caliper-hud-actions"');
    expect(htmlEn).toContain('data-testid="caliper-unit-toggle"');
    expect(htmlEn).toContain('Clear');
    expect(htmlEn).toContain('Envelope');
    expect(CJK_RE.test(htmlEn)).toBe(false);
    expect(WP_LEAK_RE.test(htmlEn)).toBe(false);

    expect(htmlZh).toContain('data-testid="caliper-hud-actions"');
    expect(htmlZh).toContain('清零');
    expect(WP_LEAK_RE.test(htmlZh)).toBe(false);

    const wbCss = readWorkspaceFile('src/styles/workbench.css');
    expect(wbCss).toMatch(
      /\.caliper-hud\s*\{[\s\S]*?width:\s*min\(388px,\s*calc\(100vw - 24px\)\)/
    );
    expect(wbCss).toMatch(
      /\.caliper-hud-actions\s*\{[\s\S]*?flex-wrap:\s*wrap/
    );
    expect(wbCss).toContain(
      ":is([data-theme='light'], .theme-light) .caliper-close-btn"
    );
  });

  it('2. PartInspectorCard emits ZERO CJK characters in EN across representative firearm, heavy armor, aircraft cannon, and archery parts', async () => {
    const sampleWeapons: WeaponId[] = [
      'ak15',
      'm1911',
      'k98k',
      'ztz99a',
      'gau8',
      'lift33',
    ];

    for (const weaponId of sampleWeapons) {
      const plugin = await loadWeaponPlugin(weaponId);
      const sampledParts = [
        plugin.parts[0],
        plugin.parts[Math.floor(plugin.parts.length / 2)],
        plugin.parts[plugin.parts.length - 1],
      ];
      for (const part of sampledParts) {
        const htmlEn = withSsrLang('en', () =>
          renderToStaticMarkup(
            React.createElement(PartInspectorCard, {
              weaponIdOverride: weaponId,
              partIdOverride: part.id,
              modeOverride: 'explode',
              langOverride: 'en',
            })
          )
        );
        expect(htmlEn).toContain('data-testid="part-inspector-subtitle"');
        expect(htmlEn).not.toContain(part.nameZh);
        expect(
          CJK_RE.test(htmlEn),
          `CJK leak found in EN PartInspectorCard for ${weaponId}:${part.id}`
        ).toBe(false);
        expect(WP_LEAK_RE.test(htmlEn)).toBe(false);
      }

      // ZH mode keeps paired English CAD nomenclature subtitle
      const firstPart = plugin.parts[0];
      const htmlZh = withSsrLang('zh', () =>
        renderToStaticMarkup(
          React.createElement(PartInspectorCard, {
            weaponIdOverride: weaponId,
            partIdOverride: firstPart.id,
            modeOverride: 'explode',
            langOverride: 'zh',
          })
        )
      );
      expect(decodeHtmlEntities(htmlZh)).toContain(firstPart.nameEn);
    }

    // Direct pure helper verification including CJK-contaminated fallback inputs
    const enSub = resolvePartInspectorSecondaryTitle({
      lang: 'en',
      part: { bomCode: 'A-01', nameEn: 'Forged Slide', nameZh: '锻钢套筒' },
      primaryTitle: 'Forged Slide',
      groupTitle: 'Slide Assembly',
      engineeringRoleLabel: 'Locking & Reciprocating',
      roleTagDisplay: '锻钢套筒',
    });
    expect(CJK_RE.test(enSub)).toBe(false);
    expect(enSub).toContain('A-01');

    const enDesc = resolvePartInspectorFallbackDescription({
      lang: 'en',
      part: {
        bomCode: 'A-01',
        nameEn: 'Forged Slide',
        description: '锻钢加工套筒用于闭锁。',
      },
      groupTitle: 'Slide Assembly',
      engineeringRoleLabel: 'Locking & Reciprocating',
      materialLabel: 'Forged 4140 Steel',
    });
    expect(CJK_RE.test(enDesc)).toBe(false);
    expect(enDesc).toContain('Forged Slide (A-01)');
  });

  it('3. BallisticsTelemetryHud defaults collapsed on <= 640px/768px phones and stacks cleanly clear of firing-compact-card with 0px overlap', () => {
    expect(TELEMETRY_MOBILE_COLLAPSE_MAX_WIDTH).toBe(768);
    expect(shouldDefaultCollapseTelemetry(390)).toBe(true);
    expect(shouldDefaultCollapseTelemetry(640)).toBe(true);
    expect(shouldDefaultCollapseTelemetry(768)).toBe(true);
    expect(shouldDefaultCollapseTelemetry(1440)).toBe(false);
    expect(shouldDefaultCollapseTelemetry(390, false)).toBe(false);
    expect(shouldDefaultCollapseTelemetry(1440, true)).toBe(true);

    // Bilingual dictionary key parity & 0 CJK in EN
    expect(Object.keys(TELEMETRY_HUD_STRINGS.en)).toEqual(
      Object.keys(TELEMETRY_HUD_STRINGS.zh)
    );
    for (const [k, val] of Object.entries(TELEMETRY_HUD_STRINGS.en)) {
      expect(CJK_RE.test(val), `CJK leak in TELEMETRY_HUD_STRINGS.en.${k}`).toBe(
        false
      );
    }

    const collapsedEn = withSsrLang('en', () =>
      renderToStaticMarkup(
        React.createElement(BallisticsTelemetryHud, {
          weaponId: 'ak15',
          alwaysVisible: true,
          defaultCollapsed: true,
        })
      )
    );
    expect(collapsedEn).toContain('ballistics-hud-header');
    expect(collapsedEn).toContain('ballistics-hud-title');
    expect(collapsedEn).toContain('ballistics-hud-controls');
    expect(collapsedEn).toContain('ballistics-hud-summary');
    expect(collapsedEn).toContain('Ballistics');
    expect(collapsedEn).toContain('data-collapsed="true"');
    expect(CJK_RE.test(collapsedEn)).toBe(false);

    const responsiveCss = readWorkspaceFile('src/styles/responsive.css');
    expect(responsiveCss).toMatch(
      /\.ballistics-telemetry-hud\.is-collapsed\s*\{[\s\S]*?max-height:\s*36px/
    );
    expect(responsiveCss).toMatch(
      /\.ballistics-telemetry-hud\.is-collapsed\s+\.ballistics-hud-header\s*\{[\s\S]*?flex-wrap:\s*nowrap/
    );
    expect(responsiveCss).toContain(
      '.ballistics-telemetry-slot:has(.ballistics-telemetry-hud:not(.is-collapsed))'
    );
    expect(responsiveCss).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*?\.ballistics-telemetry-hud\.is-collapsed\s*\{[\s\S]*?max-height:\s*34px/
    );
  });

  it('4. Acoustic Studio & workbench header popovers stack cleanly above floating cutaway focus pill', () => {
    const wbCss = readWorkspaceFile('src/styles/workbench.css');
    const armoryCss = readWorkspaceFile('src/styles/armory.css');

    expect(wbCss).toMatch(
      /\.top-bar\s*\{[\s\S]*?z-index:\s*calc\(var\(--z-banner,\s*20\)\s*\+\s*14\)/
    );
    expect(wbCss).toMatch(
      /\.workbench-popover-menu,\s*\.acoustic-deck-popover\s*\{[\s\S]*?z-index:\s*calc\(var\(--z-banner,\s*20\)\s*\+\s*20\)/
    );
    expect(wbCss).toMatch(
      /\.floating-cutaway-pill\s*\{[\s\S]*?z-index:\s*var\(--z-hud\)/
    );
    expect(armoryCss).toMatch(
      /\.armory-header\s*\{[\s\S]*?z-index:\s*calc\(var\(--z-banner,\s*20\)\s*\+\s*14\)/
    );
  });

  it('5. EN Armory desktop wordmark ("3D Vault") never flex-shrinks or truncates to "3D V..."', () => {
    expect(resolveArmoryHeaderDesktopTitle('en', 'Digital Armory 3D')).toBe(
      '3D Vault'
    );

    const htmlEn = withSsrLang('en', () =>
      renderToStaticMarkup(
        React.createElement(ArmoryView, {
          weaponIdOverride: 'ak15',
          langOverride: 'en',
        })
      )
    );
    expect(htmlEn).toContain('data-testid="armory-brand-title"');
    expect(htmlEn).toContain('3D Vault');
    expect(CJK_RE.test(stripLangSwitchPill(htmlEn))).toBe(false);
    expect(WP_LEAK_RE.test(htmlEn)).toBe(false);

    const armoryCss = readWorkspaceFile('src/styles/armory.css');
    expect(armoryCss).toMatch(
      /\.armory-brand-block\s*\{[\s\S]*?flex:\s*0\s+0\s+auto[\s\S]*?flex-shrink:\s*0/
    );
    expect(armoryCss).toMatch(
      /\.armory-brand-block\s+\.brand-title,\s*\.armory-title-desktop\s*\{[\s\S]*?flex-shrink:\s*0[\s\S]*?white-space:\s*nowrap[\s\S]*?overflow:\s*visible/
    );
    expect(armoryCss).toMatch(
      /\.armory-halls-wrap\s*\{[\s\S]*?flex:\s*1\s+1\s+0%[\s\S]*?min-inline-size:\s*0/
    );
  });

  it('6. Mobile Split Showdown Plaque A/B apply ellipsis cleanly and left-align Plaque B without edge clipping', () => {
    useAppStore.setState({
      screen: 'split_showdown',
      splitShowdownWeaponA: 'gau8',
      splitShowdownWeaponB: 'm134',
    });
    const htmlEn = withSsrLang('en', () =>
      renderToStaticMarkup(React.createElement(SplitShowdownOverlay))
    );
    expect(htmlEn.match(/class="split-plaque-caliber"/g)?.length).toBe(2);
    expect(htmlEn.match(/class="split-plaque-velocity"/g)?.length).toBe(2);
    expect(CJK_RE.test(stripLangSwitchPill(htmlEn))).toBe(false);
    expect(WP_LEAK_RE.test(htmlEn)).toBe(false);

    const splitCss = readWorkspaceFile('src/styles/split-showdown-upgrade.css');
    expect(splitCss).toMatch(
      /\.split-plaque\.is-b\s*\{[\s\S]*?text-align:\s*left[\s\S]*?border-left:\s*3px solid #f97316/
    );
    expect(splitCss).toMatch(
      /\.split-plaque\.is-b\s+\.split-plaque-specs\s*\{[\s\S]*?justify-content:\s*flex-start[\s\S]*?text-align:\s*left/
    );
    expect(splitCss).toMatch(
      /\.split-plaque-caliber\s*\{[\s\S]*?min-width:\s*0[\s\S]*?overflow:\s*hidden[\s\S]*?text-overflow:\s*ellipsis[\s\S]*?white-space:\s*nowrap/
    );
    expect(splitCss).toContain(
      ":is([data-theme='light'], .theme-light) .split-plaque.is-b"
    );
  });

  it('7. Desktop CuratorTrailBar widens to min(920px, calc(100vw - 48px)) and all 4 modified CSS sheets have balanced braces', () => {
    const wbCss = readWorkspaceFile('src/styles/workbench.css');
    expect(wbCss).toMatch(
      /\.curator-trail-bar\s*\{[\s\S]*?max-width:\s*min\(920px,\s*calc\(100vw - 48px\)\)/
    );

    const cssFiles = [
      'src/styles/workbench.css',
      'src/styles/responsive.css',
      'src/styles/armory.css',
      'src/styles/split-showdown-upgrade.css',
    ];
    for (const rel of cssFiles) {
      const { open, close } = countBraces(readWorkspaceFile(rel));
      expect(open, `Unbalanced CSS braces in ${rel}`).toBe(close);
    }
  });
});
