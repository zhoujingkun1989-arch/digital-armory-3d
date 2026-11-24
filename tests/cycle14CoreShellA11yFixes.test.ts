import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ArmoryView } from '../src/features/armory/ArmoryView';
import { SplitShowdownOverlay } from '../src/features/showdown3d/SplitShowdownOverlay';
import { AcousticDeckPopover } from '../src/features/workbench/AcousticDeckPopover';
import {
  TimelineDock,
  resolveTimelineSliderAriaLabel,
} from '../src/features/workbench/TimelineDock';
import { WorkbenchHeader } from '../src/features/workbench/WorkbenchHeader';
import { useAppStore } from '../src/store/useAppStore';

const ROOT = process.cwd();
const CJK_RE = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
const WP_LEAK_RE = /\bWP-\d+[a-z]?\b/i;

function readCss(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function assertBalancedBraces(relPath: string): void {
  const css = readCss(relPath);
  let open = 0;
  let close = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') open++;
    else if (css[i] === '}') close++;
  }
  expect(open, `Unbalanced braces in ${relPath}`).toBe(close);
}

function withSsrState<T>(
  patch: Partial<{ lang: 'zh' | 'en'; mode: 'explode' | 'firing'; screen: 'armory' | 'workbench' | 'split_showdown' }>,
  fn: () => T
): T {
  const initialState = useAppStore.getInitialState() as unknown as Record<
    string,
    unknown
  >;
  const currentState = useAppStore.getState() as unknown as Record<string, unknown>;
  const prevInitial: Record<string, unknown> = {};
  const prevCurrent: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    prevInitial[k] = initialState[k];
    prevCurrent[k] = currentState[k];
    initialState[k] = v;
  }
  useAppStore.setState(patch);
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prevInitial)) {
      initialState[k] = v;
    }
    useAppStore.setState(prevCurrent);
  }
}

function withSsrLang<T>(lang: 'zh' | 'en', fn: () => T): T {
  return withSsrState({ lang }, fn);
}

describe('Cycle 14C — Core Shell WCAG 2.1 AA Perfection & CuratorTrailBar Width Polish', () => {
  afterEach(() => {
    useAppStore.setState({
      screen: 'armory',
      activeWeaponId: 'ak15',
      mode: 'explode',
      lang: 'zh',
    });
  });

  it('1. TimelineDock provides localized aria-label on explode & firing sliders with 0 CJK in EN', () => {
    expect(resolveTimelineSliderAriaLabel('explode', 'en')).toBe(
      'Exploded disassembly progress'
    );
    expect(resolveTimelineSliderAriaLabel('firing', 'en')).toBe(
      'Dynamic firing cycle progress'
    );
    expect(CJK_RE.test(resolveTimelineSliderAriaLabel('explode', 'en'))).toBe(
      false
    );
    expect(CJK_RE.test(resolveTimelineSliderAriaLabel('firing', 'en'))).toBe(
      false
    );
    expect(WP_LEAK_RE.test(resolveTimelineSliderAriaLabel('explode', 'zh'))).toBe(
      false
    );

    const explodeEn = withSsrState(
      { screen: 'workbench', mode: 'explode', lang: 'en' },
      () => renderToStaticMarkup(React.createElement(TimelineDock))
    );
    expect(explodeEn).toContain('aria-label="Exploded disassembly progress"');
    expect(CJK_RE.test(explodeEn)).toBe(false);

    const firingEn = withSsrState(
      { screen: 'workbench', mode: 'firing', lang: 'en' },
      () => renderToStaticMarkup(React.createElement(TimelineDock))
    );
    expect(firingEn).toContain('aria-label="Dynamic firing cycle progress"');
    expect(CJK_RE.test(firingEn)).toBe(false);
  });

  it('2. ArmoryView, AcousticDeckPopover & WorkbenchHeader omit aria-controls when popover/drawer is closed and emit valid IDs when open', () => {
    const armoryClosed = withSsrLang('en', () =>
      renderToStaticMarkup(
        React.createElement(ArmoryView, {
          weaponIdOverride: 'ak15',
          langOverride: 'en',
        })
      )
    );
    expect(armoryClosed).not.toContain('aria-controls="armory-labs-popover-panel"');
    expect(armoryClosed).not.toContain(
      'aria-controls="armory-display-popover-panel"'
    );
    expect(armoryClosed).not.toContain(
      'aria-controls="armory-mobile-nav-drawer"'
    );

    const acousticClosed = withSsrLang('en', () =>
      renderToStaticMarkup(
        React.createElement(AcousticDeckPopover, {
          weaponIdOverride: 'm1911',
          langOverride: 'en',
        })
      )
    );
    expect(acousticClosed).not.toContain('aria-controls=');

    const acousticOpen = withSsrLang('en', () =>
      renderToStaticMarkup(
        React.createElement(AcousticDeckPopover, {
          weaponIdOverride: 'm1911',
          langOverride: 'en',
          defaultOpen: true,
        })
      )
    );
    const ctrlMatch = acousticOpen.match(/aria-controls="([^"]+)"/);
    expect(ctrlMatch).not.toBeNull();
    expect(acousticOpen).toContain(`id="${ctrlMatch?.[1]}"`);

    useAppStore.setState({ screen: 'workbench', activeWeaponId: 'ak15' });
    const wbHeaderClosed = withSsrLang('en', () =>
      renderToStaticMarkup(React.createElement(WorkbenchHeader))
    );
    expect(wbHeaderClosed).not.toContain('aria-controls=');
  });

  it('3. SplitShowdownOverlay renders a semantic <h1> landmark in ZH and EN without breaking top-bar layout', () => {
    useAppStore.setState({
      screen: 'split_showdown',
      splitShowdownWeaponA: 'ak15',
      splitShowdownWeaponB: 'm4a1',
    });

    const splitEn = withSsrLang('en', () =>
      renderToStaticMarkup(React.createElement(SplitShowdownOverlay))
    );
    const h1En = splitEn.match(/<h1 class="split-topbar-title">([^<]+)<\/h1>/);
    expect(h1En).not.toBeNull();
    expect(CJK_RE.test(h1En?.[1] ?? '')).toBe(false);
    expect(WP_LEAK_RE.test(h1En?.[1] ?? '')).toBe(false);

    const splitZh = withSsrLang('zh', () =>
      renderToStaticMarkup(React.createElement(SplitShowdownOverlay))
    );
    expect(splitZh).toMatch(/<h1 class="split-topbar-title">[^<]+<\/h1>/);

    const splitCss = readCss('src/styles/split-showdown.css');
    expect(splitCss).toMatch(
      /\.split-topbar-title\s*\{[\s\S]*?position:\s*absolute[\s\S]*?overflow:\s*hidden/
    );
  });

  it('4. Enforces >= 32px mobile touch targets (.lang-seg-btn, .mode-tab, .play-btn), widens CuratorTrailBar to 980px & balances CSS braces', () => {
    const storyCss = readCss('src/styles/story.css');
    expect(storyCss).toMatch(
      /@media\s*\(max-width:\s*768px\)[\s\S]*?\.lang-seg-btn\s*\{[\s\S]*?min-width:\s*34px[\s\S]*?min-height:\s*34px/
    );

    const responsiveCss = readCss('src/styles/responsive.css');
    expect(responsiveCss).toMatch(
      /\.dock-mode-bar\s+\.mode-tab\s*\{[\s\S]*?min-height:\s*32px/
    );
    expect(responsiveCss).toMatch(
      /\.timeline-scrubber-row\s+\.play-btn\s*\{[\s\S]*?min-height:\s*34px/
    );
    expect(responsiveCss).toMatch(
      /\.firing-action-strip\s*>\s*button\s*\{[\s\S]*?min-height:\s*32px/
    );
    expect(responsiveCss).toMatch(
      /\.lang-seg-btn\s*\{[\s\S]*?min-width:\s*34px[\s\S]*?min-height:\s*34px/
    );

    const wbCss = readCss('src/styles/workbench.css');
    expect(wbCss).toMatch(
      /@media\s*\(min-width:\s*1280px\)\s*\{\s*\.curator-trail-bar\s*\{\s*max-width:\s*min\(980px,\s*calc\(100vw - 48px\)\)/
    );

    for (const rel of [
      'src/styles/story.css',
      'src/styles/workbench.css',
      'src/styles/responsive.css',
      'src/styles/split-showdown.css',
    ]) {
      assertBalancedBraces(rel);
    }
  });
});
