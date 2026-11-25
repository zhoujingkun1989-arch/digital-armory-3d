import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useCausalitySandboxStore } from '../src/engine/physics/causalitySandbox';
import {
  buildOfflineHallBreakdown,
  OFFLINE_SPECIALIZED_HALLS,
  OfflineMuseumModal,
} from '../src/features/offline/OfflineMuseumModal';
import CausalitySandboxModal from '../src/features/sandbox/CausalitySandboxModal';
import { useAppStore } from '../src/store/useAppStore';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';

const REPO_ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const WP_LEAK_RE = /\bWP-\d+[a-z]?\b/i;

type ZustandLikeStore<S> = {
  getState: () => S;
  getInitialState: () => S;
  setState: (partial: Partial<S>) => void;
};

function withStoreSsrState<S extends object, T>(
  store: ZustandLikeStore<S>,
  overrides: Partial<S>,
  fn: () => T
): T {
  const initialState = store.getInitialState() as unknown as Record<
    string,
    unknown
  >;
  const liveState = store.getState() as unknown as Record<string, unknown>;
  const prevInitial: Record<string, unknown> = {};
  const prevLive: Record<string, unknown> = {};
  const keys = Object.keys(overrides) as Array<keyof S>;
  for (const key of keys) {
    const k = key as string;
    prevInitial[k] = initialState[k];
    prevLive[k] = liveState[k];
    initialState[k] = overrides[key];
  }
  store.setState(overrides);
  try {
    return fn();
  } finally {
    for (const key of keys) {
      const k = key as string;
      initialState[k] = prevInitial[k];
    }
    store.setState(prevLive as Partial<S>);
  }
}

function getAttr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return m ? m[1] : null;
}

function assertAllButtonsAndInputsLabeled(html: string, label: string): void {
  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const attrs = match[1] ?? '';
    const inner = match[2] ?? '';
    const ariaLabel = getAttr(attrs, 'aria-label')?.trim() ?? '';
    const visibleText = inner
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    expect(
      ariaLabel.length > 0 || visibleText.length > 0,
      `${label}: unlabeled <button ${attrs.trim()}>`
    ).toBe(true);
  }

  for (const match of html.matchAll(/<(input|select)\b([^>]*)>/gi)) {
    const tag = match[1] ?? 'input';
    const attrs = match[2] ?? '';
    const ariaLabel = getAttr(attrs, 'aria-label')?.trim() ?? '';
    const ariaLabelledBy = getAttr(attrs, 'aria-labelledby')?.trim() ?? '';
    expect(
      ariaLabel.length > 0 || ariaLabelledBy.length > 0,
      `${label}: unlabeled <${tag} ${attrs.trim()}>`
    ).toBe(true);
  }
}

describe('Cycle 20A — Causality Sandbox & Offline Museum Final Craft & WCAG Polish', () => {
  it('renders localized aria-valuetext sliders, polite diagnosis live region & mechanism principle context in CausalitySandboxModal (EN & ZH)', () => {
    const enFirearm = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'm1911' },
      () =>
        withStoreSsrState(
          useCausalitySandboxStore,
          { enabled: true, powderLoadScale: 1.25, gasPortScale: 1.35 },
          () => renderToStaticMarkup(React.createElement(CausalitySandboxModal))
        )
    );
    const zhFirearm = withStoreSsrState(
      useAppStore,
      { lang: 'zh', activeWeaponId: 'm1911' },
      () =>
        renderToStaticMarkup(React.createElement(CausalitySandboxModal))
    );
    const enArchery = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'lift33' },
      () =>
        renderToStaticMarkup(React.createElement(CausalitySandboxModal))
    );

    assertAllButtonsAndInputsLabeled(enFirearm, 'CausalitySandboxModal EN');
    assertAllButtonsAndInputsLabeled(zhFirearm, 'CausalitySandboxModal ZH');
    assertAllButtonsAndInputsLabeled(enArchery, 'CausalitySandboxModal archery EN');

    // All 4 physics sliders expose aria-valuetext
    const rangeSliders = [...enFirearm.matchAll(/<input[^>]*type="range"[^>]*>/gi)];
    expect(rangeSliders.length).toBe(4);
    for (const [tag] of rangeSliders) {
      expect(getAttr(tag, 'aria-label')?.length ?? 0).toBeGreaterThan(2);
      expect(getAttr(tag, 'aria-valuetext')?.length ?? 0).toBeGreaterThan(4);
    }
    expect(enFirearm).toContain('MPa');
    expect(enFirearm).toContain('gas port flow');
    expect(enFirearm).toContain('spring rate');
    expect(enFirearm).toContain('bolt carrier mass');
    expect(enFirearm).toContain('Peak pressure');
    expect(enArchery).toContain('cam energy');

    // Dynamic diagnosis readout uses polite live region
    expect(enFirearm).toMatch(
      /class="causality-diagnostic-banner[^"]*"[^>]*role="status"[^>]*aria-live="polite"/
    );

    // Active Mechanism Principle Context Pill renders flagship glossary term for M1911
    expect(enFirearm).toContain('data-testid="causality-principle-context"');
    expect(enFirearm).toContain('Browning Tilting-Barrel Lock');
    expect(zhFirearm).toContain('勃朗宁枪管偏移闭锁');

    expect(CJK_RE.test(enFirearm)).toBe(false);
    expect(CJK_RE.test(enArchery)).toBe(false);
  });

  it('partitions all 100 exhibits across all specialized halls in buildOfflineHallBreakdown() and exposes persistent aria-live & hall bar in OfflineMuseumModal', () => {
    const emptyBreakdown = buildOfflineHallBreakdown([]);
    expect(emptyBreakdown.length).toBe(OFFLINE_SPECIALIZED_HALLS.length);
    const totalSum = emptyBreakdown.reduce((acc, h) => acc + h.total, 0);
    expect(totalSum).toBe(WEAPON_MANIFESTS.length);
    expect(totalSum).toBe(100);
    expect(emptyBreakdown.every((h) => h.cached === 0 && !h.isComplete)).toBe(
      true
    );

    const armorRow = emptyBreakdown.find((h) => h.hallId === 'armor');
    const ordnanceRow = emptyBreakdown.find((h) => h.hallId === 'ordnance');
    const archeryRow = emptyBreakdown.find((h) => h.hallId === 'archery');
    expect(armorRow?.total).toBe(8);
    expect(ordnanceRow?.total).toBe(4);
    expect(archeryRow?.total).toBe(5);

    const partialBreakdown = buildOfflineHallBreakdown([
      'ztz99a',
      'm1a2',
      'leopard2a7',
      'tiger1',
      't90m',
      'challenger2',
      'merkava4',
      't34_85',
      'gau8',
      'm61vulcan',
      'bofors40',
      'm777',
      'ak15',
    ]);
    expect(
      partialBreakdown.reduce((acc, h) => acc + h.cached, 0)
    ).toBe(13);
    expect(partialBreakdown.find((h) => h.hallId === 'armor')?.isComplete).toBe(
      true
    );
    expect(
      partialBreakdown.find((h) => h.hallId === 'ordnance')?.isComplete
    ).toBe(true);
    expect(partialBreakdown.find((h) => h.hallId === 'assault')?.cached).toBe(
      1
    );

    const fullBreakdown = buildOfflineHallBreakdown(
      WEAPON_MANIFESTS.map((m) => m.id)
    );
    expect(
      fullBreakdown.every((h) => h.isComplete && h.pct === 100)
    ).toBe(true);

    const enHtml = withStoreSsrState(useAppStore, { lang: 'en' }, () =>
      renderToStaticMarkup(
        React.createElement(OfflineMuseumModal, { onClose: () => {} })
      )
    );
    const zhHtml = withStoreSsrState(useAppStore, { lang: 'zh' }, () =>
      renderToStaticMarkup(
        React.createElement(OfflineMuseumModal, { onClose: () => {} })
      )
    );

    assertAllButtonsAndInputsLabeled(enHtml, 'OfflineMuseumModal EN');
    assertAllButtonsAndInputsLabeled(zhHtml, 'OfflineMuseumModal ZH');

    expect(enHtml).toContain('data-testid="offline-halls-breakdown"');
    expect((enHtml.match(/class="offline-hall-chip/g) ?? []).length).toBe(10);
    expect(enHtml).toContain('data-testid="offline-live-announcer"');
    expect(enHtml).toContain('role="status" aria-live="polite"');
    expect(zhHtml).toContain('10 大展厅离线藏品覆盖进度');
    expect(CJK_RE.test(enHtml)).toBe(false);
  });

  it('preserves strict lazy-loading, Blueprint Daylight, mobile >= 34px, reduced-motion, balanced braces & zero WP-XX leaks across all 4 owned files', () => {
    const appSrc = fs.readFileSync(path.join(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(appSrc).toMatch(
      /const\s+LazyCausalitySandboxModal\s*=\s*(?:React\.)?lazy\(/
    );
    expect(appSrc).toMatch(
      /const\s+LazyOfflineMuseumModal\s*=\s*(?:React\.)?lazy\(/
    );
    expect(appSrc).not.toMatch(/^import\s+.*CausalitySandboxModal/m);
    expect(appSrc).not.toMatch(/^import\s+.*OfflineMuseumModal/m);

    for (const rel of [
      'src/styles/causality-sandbox.css',
      'src/styles/offline-museum.css',
    ]) {
      const css = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect(css, `${rel}: missing mobile breakpoint`).toContain(
        '@media (max-width: 768px)'
      );
      expect(css, `${rel}: missing >= 34px mobile target`).toContain(
        'min-height: 34px'
      );
      expect(css, `${rel}: missing Blueprint Daylight`).toContain(
        "[data-theme='light']"
      );
      expect(css, `${rel}: missing prefers-reduced-motion`).toContain(
        '@media (prefers-reduced-motion: reduce)'
      );
      expect(WP_LEAK_RE.test(css), `${rel}: WP-XX leak`).toBe(false);
      expect((css.match(/\{/g) ?? []).length, `${rel}: unbalanced braces`).toBe(
        (css.match(/\}/g) ?? []).length
      );
    }

    for (const rel of [
      'src/features/sandbox/CausalitySandboxModal.tsx',
      'src/features/offline/OfflineMuseumModal.tsx',
    ]) {
      const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect(WP_LEAK_RE.test(src), `${rel}: WP-XX leak`).toBe(false);
    }
  });
});
