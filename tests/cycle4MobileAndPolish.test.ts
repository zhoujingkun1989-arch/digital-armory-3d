import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TALL_GRIP_CT_EXTRA_CLEARANCE_CM,
  TALL_GRIP_PISTOL_IDS,
  WORKBENCH_ENTRY_EASE_DURATION_S,
  computeWorkbenchSectionBarOffsetY,
  evaluateCameraEaseProgress,
} from '../src/engine/canvas/ArmoryViewport';
import { ArmoryView } from '../src/features/armory/ArmoryView';
import { ExternalBallisticsView } from '../src/features/ballistics/ExternalBallisticsView';
import { CartridgeLabView } from '../src/features/cartridges/CartridgeLabView';
import { ShowcaseView } from '../src/features/showcase/ShowcaseView';
import { SplitShowdownOverlay } from '../src/features/showdown3d/SplitShowdownOverlay';
import { SHOWCASE_STRINGS } from '../src/i18n/showcaseStrings';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import { useAppStore } from '../src/store/useAppStore';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

afterEach(() => {
  useAppStore.getState().setLang('zh');
  useAppStore.getState().resetAll();
});

describe('Cycle 4B — Mobile Header Parity, Keynote Typography & Camera Polish', () => {
  it('adds +1.4 cm extra vertical CT-bar clearance for all tall-grip pistols while preserving non-pistol framing', () => {
    expect(TALL_GRIP_CT_EXTRA_CLEARANCE_CM).toBe(1.4);
    expect([...TALL_GRIP_PISTOL_IDS].sort()).toEqual([
      'deagle',
      'g17',
      'm1911',
      'p08',
      'p320',
      'python',
    ]);

    const baseClose = computeWorkbenchSectionBarOffsetY(
      'pistol',
      'firing_view',
      true
    );
    const baseIso = computeWorkbenchSectionBarOffsetY('pistol', 'iso', true);

    for (const pistolId of TALL_GRIP_PISTOL_IDS) {
      expect(
        computeWorkbenchSectionBarOffsetY('pistol', 'firing_view', true, pistolId)
      ).toBeCloseTo(baseClose - TALL_GRIP_CT_EXTRA_CLEARANCE_CM, 5);
      expect(
        computeWorkbenchSectionBarOffsetY('pistol', 'cutaway_focus', true, pistolId)
      ).toBeCloseTo(baseClose - TALL_GRIP_CT_EXTRA_CLEARANCE_CM, 5);
      expect(
        computeWorkbenchSectionBarOffsetY('pistol', 'iso', true, pistolId)
      ).toBeCloseTo(baseIso - TALL_GRIP_CT_EXTRA_CLEARANCE_CM, 5);
      expect(
        computeWorkbenchSectionBarOffsetY('pistol', 'iso', false, pistolId)
      ).toBe(0);
      expect(
        computeWorkbenchSectionBarOffsetY('pistol', 'top', true, pistolId)
      ).toBe(0);
      expect(
        computeWorkbenchSectionBarOffsetY(
          'pistol',
          'armory_showcase',
          true,
          pistolId
        )
      ).toBe(0);
    }

    // Non-pistol platforms keep their exact baseline scale-aware offsets
    expect(
      computeWorkbenchSectionBarOffsetY('rifle', 'iso', true, 'ak15')
    ).toBe(-2.8);
    expect(
      computeWorkbenchSectionBarOffsetY(
        'main_battle_tank',
        'iso',
        true,
        'ztz99a'
      )
    ).toBe(-28);
  });

  it('provides deterministic ~0.55s cubic ease-out for Armory -> Workbench hero camera & view-offset transition', () => {
    expect(WORKBENCH_ENTRY_EASE_DURATION_S).toBe(0.55);
    expect(evaluateCameraEaseProgress(-0.1)).toBe(0);
    expect(evaluateCameraEaseProgress(0)).toBe(0);
    // Cubic ease-out at midpoint u=0.5 -> 1 - 0.5^3 = 0.875
    expect(evaluateCameraEaseProgress(0.275, 0.55)).toBeCloseTo(0.875, 6);
    expect(evaluateCameraEaseProgress(0.55, 0.55)).toBe(1);
    expect(evaluateCameraEaseProgress(1.2, 0.55)).toBe(1);

    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const val = evaluateCameraEaseProgress((i / 10) * 0.55, 0.55);
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }

    const viewportSrc = fs.readFileSync(
      path.join(ROOT, 'src/engine/canvas/ArmoryViewport.tsx'),
      'utf8'
    );
    expect(viewportSrc).toContain('viewOffsetRef');
    expect(viewportSrc).toContain('WORKBENCH_ENTRY_EASE_DURATION_S');
    expect(viewportSrc).toContain('enteringFromHero');
  });

  it('delivers concise Armory wordmarks, EN hall scroll cue, and eager cold-load [S] keycap styling', () => {
    expect(UI_STRINGS.zh.armory.title).toBe('3D 数字兵器库');
    expect(UI_STRINGS.zh.armory.mobileTitle).toBe('3D 兵器库');
    expect(UI_STRINGS.zh.armory.mobileEnterBenchBtn).toBe('拆解');
    expect(UI_STRINGS.en.armory.title).toBe('Digital Armory 3D');
    expect(UI_STRINGS.en.armory.mobileTitle).toBe('Armory 3D');
    expect(UI_STRINGS.en.armory.mobileEnterBenchBtn).toBe('Inspect');
    expect(CJK_RE.test(UI_STRINGS.en.armory.title)).toBe(false);
    expect(CJK_RE.test(UI_STRINGS.en.armory.mobileTitle)).toBe(false);
    expect(CJK_RE.test(UI_STRINGS.en.armory.hallsScrollMoreAria)).toBe(false);
    expect(CJK_RE.test(UI_STRINGS.en.armory.mobileEnterBenchBtn)).toBe(false);

    const html = renderToStaticMarkup(React.createElement(ArmoryView));
    expect(html).toContain('class="armory-title-desktop">3D 数字兵器库');
    expect(html).toContain('class="armory-title-mobile">3D 兵器库');
    expect(html).toContain('class="armory-enter-desktop"');
    expect(html).toContain('class="armory-enter-mobile">拆解');
    expect(html).toContain('class="armory-halls-wrap"');
    expect(html).toContain('armory-halls-scroll-cue');
    expect(html).toContain('class="plaque-showdown-kbd">S</span>');

    const armoryCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/armory.css'),
      'utf8'
    );
    expect(armoryCss).toContain('.plaque-showdown-cta');
    expect(armoryCss).toContain('.plaque-showdown-kbd');
    expect(armoryCss).toContain('.armory-halls-scroll-cue');
  });

  it('enforces <= 52-56px mobile header parity across Split, 1000m Range, Cartridges & Workbench cutaway pill', () => {
    // 1. Split Showdown: StudioEnvironmentBar collapsed out of .split-topbar-left into .split-topbar-right
    const splitHtml = renderToStaticMarkup(
      React.createElement(SplitShowdownOverlay)
    );
    const leftIdx = splitHtml.indexOf('class="split-topbar-left"');
    const centerIdx = splitHtml.indexOf('class="split-topbar-center"');
    const envWrapIdx = splitHtml.indexOf('class="split-env-cluster-wrap"');
    expect(leftIdx).toBeGreaterThan(-1);
    expect(centerIdx).toBeGreaterThan(leftIdx);
    expect(envWrapIdx).toBeGreaterThan(centerIdx);
    expect(splitHtml.slice(leftIdx, centerIdx)).not.toContain(
      'studio-env-cluster'
    );

    const splitUpgradeCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/split-showdown-upgrade.css'),
      'utf8'
    );
    expect(splitUpgradeCss).toContain(
      '.split-topbar:not(.is-mobile-expanded) .studio-env-cluster'
    );
    expect(splitUpgradeCss).toMatch(/\.split-topbar-left\s*\{[\s\S]*?min-height:\s*40px/);

    // 2. 1000m External Ballistics: collapsible mobile tools drawer with bilingual labels
    const ebHtml = renderToStaticMarkup(
      React.createElement(ExternalBallisticsView)
    );
    expect(ebHtml).toContain('eb-mobile-menu-btn');
    const ebSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/ballistics/ExternalBallisticsView.tsx'),
      'utf8'
    );
    expect(ebSrc).toContain("'Close'");
    expect(ebSrc).toContain("'Menu'");
    const ebCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/external-ballistics.css'),
      'utf8'
    );
    expect(ebCss).toContain('.eb-header:not(.is-mobile-expanded) .eb-header-actions');
    expect(ebCss).toContain('.eb-mobile-menu-btn');

    // 3. Cartridge Lab: compact mobile title + collapsible tools drawer with bilingual labels
    const cartHtml = renderToStaticMarkup(
      React.createElement(CartridgeLabView)
    );
    expect(cartHtml).toContain('cartridge-title-compact');
    expect(cartHtml).toContain('cartridge-mobile-menu-btn');
    const cartSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/cartridges/CartridgeLabView.tsx'),
      'utf8'
    );
    expect(cartSrc).toContain("'Cartridge Lab'");
    expect(cartSrc).toContain("'Heavy Ordnance'");
    const cartCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/cartridges.css'),
      'utf8'
    );
    expect(cartCss).toContain(
      '.cartridge-header:not(.is-mobile-expanded) .cartridge-header-actions'
    );
    expect(cartCss).toContain('.cartridge-title-compact');
    expect(cartCss).toContain('@media (max-width: 440px)');

    // 4. Mobile Workbench centered 40x40 square cutaway pill
    const responsiveCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/responsive.css'),
      'utf8'
    );
    expect(responsiveCss).toMatch(
      /\.top-bar\s+\.wb-mobile-actions\s+\.wb-mobile-cut-btn\s*\{[\s\S]*?justify-content:\s*center;[\s\S]*?padding:\s*0;[\s\S]*?width:\s*40px;[\s\S]*?height:\s*40px;/
    );
    expect(responsiveCss).toContain('.armory-header .armory-title-mobile');
    expect(responsiveCss).toContain('.armory-header .armory-enter-mobile');
  });

  it('tightens Showcase keynote hero copy & fixes mobile sticky nav clipping and eyebrow wrap', () => {
    for (const lang of ['zh', 'en'] as const) {
      const h = SHOWCASE_STRINGS[lang].hero;
      expect(h.eyebrow).toContain('34');
      expect(h.eyebrow).toContain('1980');
      const combined = `${h.subLead}${h.subPartsStrong}${h.subMapsStrong}${h.subAudioStrong}${h.subTail}`;
      expect(combined).toContain('854');
      expect(combined).toContain('414');
      expect(combined).toContain('1980');
      if (lang === 'zh') {
        expect(combined.length).toBeLessThan(115);
      } else {
        expect(combined.length).toBeLessThan(190);
        expect(CJK_RE.test(h.eyebrow)).toBe(false);
        expect(CJK_RE.test(combined)).toBe(false);
      }
    }

    const showcaseHtml = renderToStaticMarkup(
      React.createElement(ShowcaseView)
    );
    expect(showcaseHtml).toContain('class="showcase-launch-full"');
    expect(showcaseHtml).toContain('class="showcase-launch-compact">兵器库');
    const showcaseSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/showcase/ShowcaseView.tsx'),
      'utf8'
    );
    expect(showcaseSrc).toContain("lang === 'zh' ? '兵器库' : 'Armory'");

    const showcaseCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/showcase.css'),
      'utf8'
    );
    expect(showcaseCss).toContain('.showcase-launch-compact');
    expect(showcaseCss).toContain('.showcase-brand-ver,');
    expect(showcaseCss).toMatch(
      /\.showcase-eyebrow\s*\{[\s\S]*?white-space:\s*normal;/
    );
  });
});
