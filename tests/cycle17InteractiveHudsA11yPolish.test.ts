import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useArmorerExamStore } from '../src/engine/exam/armorerExamStore';
import { fieldStripStore } from '../src/engine/fieldstrip/fieldStripStore';
import { malfunctionStore } from '../src/engine/malfunctions/malfunctionStore';
import { useTankCrewStore } from '../src/engine/tank/tankCrewStore';
import { WeaponStoryDrawer } from '../src/features/story/WeaponStoryDrawer';
import AttachmentBenchPanel from '../src/features/workbench/AttachmentBenchPanel';
import { FieldStripHud } from '../src/features/workbench/FieldStripHud';
import { MalfunctionHud } from '../src/features/workbench/MalfunctionHud';
import { TankCrewHud } from '../src/features/workbench/TankCrewHud';
import { useAppStore } from '../src/store/useAppStore';

const REPO_ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const WP_LEAK_RE = /\bWP-\d+[a-z]?\b/i;

type ZustandLikeStore<S> = {
  getState: () => S;
  getInitialState: () => S;
  setState: (partial: Partial<S>) => void;
};

/**
 * Zustand v5 `useSyncExternalStore` reads `getInitialState()` during React SSR.
 * Temporarily patch both `getInitialState()` and live state so SSR captures
 * exact bilingual & feature-state renders cleanly, restoring everything after.
 */
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

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

function stripLangSwitchPill(html: string): string {
  return html.replace(
    /<div[^>]*class="[^"]*lang-switch-pill[^"]*"[^>]*>[\s\S]*?<\/div>/g,
    ''
  );
}

function getAttr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return m ? m[1] : null;
}

/**
 * Verifies core WCAG 2.1 AA invariants on an SSR HTML snapshot:
 * 1. Every `<button>` has a non-empty accessible name (aria-label / aria-labelledby / visible text).
 * 2. Zero `<button>` elements have `role="listitem"` overriding button semantics.
 * 3. Every `<input>` and `<select>` has an explicit `aria-label` or `aria-labelledby`.
 * 4. Every `aria-controls="X"` references an existing `id="X"` inside the snapshot (zero dangling controls).
 */
function assertWcagHtmlContracts(html: string, label: string): void {
  const buttonMatches = html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi);
  for (const match of buttonMatches) {
    const attrs = match[1] ?? '';
    const inner = match[2] ?? '';
    const role = getAttr(attrs, 'role');
    expect(role, `${label}: <button> must not override role="listitem"`).not.toBe(
      'listitem'
    );
    const ariaLabel = getAttr(attrs, 'aria-label')?.trim() ?? '';
    const ariaLabelledBy = getAttr(attrs, 'aria-labelledby')?.trim() ?? '';
    const visibleText = inner
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    expect(
      ariaLabel.length > 0 || ariaLabelledBy.length > 0 || visibleText.length > 0,
      `${label}: unlabeled <button ${attrs.trim()}>`
    ).toBe(true);
  }

  const inputMatches = html.matchAll(/<(input|select)\b([^>]*)>/gi);
  for (const match of inputMatches) {
    const tag = match[1] ?? 'input';
    const attrs = match[2] ?? '';
    const ariaLabel = getAttr(attrs, 'aria-label')?.trim() ?? '';
    const ariaLabelledBy = getAttr(attrs, 'aria-labelledby')?.trim() ?? '';
    expect(
      ariaLabel.length > 0 || ariaLabelledBy.length > 0,
      `${label}: unlabeled <${tag} ${attrs.trim()}>`
    ).toBe(true);
  }

  const ids = new Set<string>();
  for (const idMatch of html.matchAll(/\bid="([^"]+)"/gi)) {
    if (idMatch[1]) ids.add(idMatch[1]);
  }
  for (const ctrlMatch of html.matchAll(/\baria-controls="([^"]+)"/gi)) {
    const targetIds = (ctrlMatch[1] ?? '').split(/\s+/).filter(Boolean);
    for (const targetId of targetIds) {
      expect(
        ids.has(targetId),
        `${label}: dangling aria-controls="${targetId}"`
      ).toBe(true);
    }
  }
}

describe('Cycle 17A — Interactive Workbench HUDs WCAG 2.1 AA, aria-live & Mobile Polish', () => {
  it('audits FieldStripHud (guided & blind exam, EN & ZH) for accessible names, live regions & zero EN CJK', () => {
    fieldStripStore.syncWeapon('ak15', false);

    const guidedEn = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'ak15' },
      () => renderToStaticMarkup(React.createElement(FieldStripHud))
    );
    const guidedZh = withStoreSsrState(
      useAppStore,
      { lang: 'zh', activeWeaponId: 'ak15' },
      () => renderToStaticMarkup(React.createElement(FieldStripHud))
    );

    assertWcagHtmlContracts(guidedEn, 'FieldStripHud guided EN');
    assertWcagHtmlContracts(guidedZh, 'FieldStripHud guided ZH');
    expect(guidedEn).toContain('role="region"');
    expect(guidedEn).toContain('aria-label="Disassembly tier"');
    expect(guidedEn).toContain('aria-label="Strip and reassembly phase"');
    expect(guidedEn).toContain('aria-live="polite"');
    expect(guidedEn).toContain('aria-pressed="true"');
    expect(CJK_RE.test(guidedEn)).toBe(false);

    // Blind exam mode SSR
    const blindExamSnapshot = {
      ...useArmorerExamStore.getInitialState().fieldStripExam,
      active: true,
      weaponId: 'ak15' as const,
      phase: 'disassembly' as const,
      totalSteps: 6,
      completedPhaseSteps: 1,
      parSeconds: 45,
    };
    const blindEn = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'ak15' },
      () =>
        withStoreSsrState(
          useArmorerExamStore,
          { fieldStripExam: blindExamSnapshot },
          () => renderToStaticMarkup(React.createElement(FieldStripHud))
        )
    );
    assertWcagHtmlContracts(blindEn, 'FieldStripHud blind exam EN');
    expect(blindEn).toContain('aria-live="polite"');
    expect(blindEn).toContain('aria-label="Blind exam step progress"');
    expect(CJK_RE.test(blindEn)).toBe(false);
  });

  it('audits MalfunctionHud (guided firearm/archery & blind triage, EN & ZH) for WCAG & live status banners', () => {
    malfunctionStore.selectMalfunction('stovepipe', 'ak15');

    const guidedEn = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'ak15' },
      () => renderToStaticMarkup(React.createElement(MalfunctionHud))
    );
    const archeryEn = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'lift33' },
      () => renderToStaticMarkup(React.createElement(MalfunctionHud))
    );
    const guidedZh = withStoreSsrState(
      useAppStore,
      { lang: 'zh', activeWeaponId: 'ak15' },
      () => renderToStaticMarkup(React.createElement(MalfunctionHud))
    );

    assertWcagHtmlContracts(guidedEn, 'MalfunctionHud guided EN');
    assertWcagHtmlContracts(archeryEn, 'MalfunctionHud archery EN');
    assertWcagHtmlContracts(guidedZh, 'MalfunctionHud guided ZH');
    expect(guidedEn).toContain('role="region"');
    expect(guidedEn).toContain('aria-label="Stoppage scenario selection"');
    expect(guidedEn).toContain('role="status"');
    expect(guidedEn).toContain('aria-live="polite"');
    expect(CJK_RE.test(guidedEn)).toBe(false);
    expect(CJK_RE.test(archeryEn)).toBe(false);

    // Blind triage mode SSR
    const triageSnapshot = {
      ...useArmorerExamStore.getInitialState().triageExam,
      active: true,
      weaponId: 'ak15' as const,
      phase: 'diagnosis' as const,
      secretKind: 'stovepipe' as const,
    };
    const triageEn = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'ak15' },
      () =>
        withStoreSsrState(
          useArmorerExamStore,
          { triageExam: triageSnapshot },
          () => renderToStaticMarkup(React.createElement(MalfunctionHud))
        )
    );
    assertWcagHtmlContracts(triageEn, 'MalfunctionHud blind triage EN');
    expect(triageEn).toContain('aria-label="Blind stoppage diagnosis options"');
    expect(triageEn).toContain(
      'aria-label="Cutaway and X-ray inspection toggles"'
    );
    expect(triageEn).toContain('aria-live="polite"');
    expect(CJK_RE.test(triageEn)).toBe(false);
  });

  it('audits AttachmentBenchPanel (firearm, heavy armor & aero ordnance, EN & ZH) for WCAG & polite coupling telemetry', () => {
    const m4a1En = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'm4a1' },
      () => renderToStaticMarkup(React.createElement(AttachmentBenchPanel))
    );
    const m4a1Zh = withStoreSsrState(
      useAppStore,
      { lang: 'zh', activeWeaponId: 'm4a1' },
      () => renderToStaticMarkup(React.createElement(AttachmentBenchPanel))
    );
    const tankEn = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'ztz99a' },
      () => renderToStaticMarkup(React.createElement(AttachmentBenchPanel))
    );
    const gau8En = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'gau8' },
      () => renderToStaticMarkup(React.createElement(AttachmentBenchPanel))
    );

    assertWcagHtmlContracts(m4a1En, 'AttachmentBenchPanel m4a1 EN');
    assertWcagHtmlContracts(m4a1Zh, 'AttachmentBenchPanel m4a1 ZH');
    assertWcagHtmlContracts(tankEn, 'AttachmentBenchPanel ztz99a EN');
    assertWcagHtmlContracts(gau8En, 'AttachmentBenchPanel gau8 EN');

    expect(m4a1En).toContain('class="att-coupling-banner" role="status" aria-live="polite"');
    expect(m4a1En).toContain('aria-pressed="true"');
    expect(tankEn).toContain('role="status" aria-live="polite"');
    expect(CJK_RE.test(m4a1En)).toBe(false);
    expect(CJK_RE.test(tankEn)).toBe(false);
    expect(CJK_RE.test(gau8En)).toBe(false);
  });

  it('audits TankCrewHud across MBT platforms (ztz99a & tiger1, EN & ZH) for labeled sliders, pressed pills & polite FCS telemetry', () => {
    const ztzEn = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'ztz99a' },
      () =>
        withStoreSsrState(
          useTankCrewStore,
          { active: true, station: 'gunner', opticMode: 'flir_whot' },
          () => renderToStaticMarkup(React.createElement(TankCrewHud))
        )
    );
    const ztzZh = withStoreSsrState(
      useAppStore,
      { lang: 'zh', activeWeaponId: 'ztz99a' },
      () =>
        withStoreSsrState(
          useTankCrewStore,
          { active: true, station: 'gunner', opticMode: 'flir_whot' },
          () => renderToStaticMarkup(React.createElement(TankCrewHud))
        )
    );
    const tigerEn = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'tiger1' },
      () =>
        withStoreSsrState(
          useTankCrewStore,
          { active: true, station: 'gunner', opticMode: 'flir_whot' },
          () => renderToStaticMarkup(React.createElement(TankCrewHud))
        )
    );

    assertWcagHtmlContracts(ztzEn, 'TankCrewHud ztz99a EN');
    assertWcagHtmlContracts(ztzZh, 'TankCrewHud ztz99a ZH');
    assertWcagHtmlContracts(tigerEn, 'TankCrewHud tiger1 EN');

    expect(ztzEn).toContain('aria-label="Crew station view"');
    expect(ztzEn).toContain('aria-label="Optic imaging mode"');
    expect(ztzEn).toContain('aria-label="Turret Traverse Azimuth"');
    expect(ztzEn).toContain('aria-label="Main Gun Elevation"');
    expect(ztzEn).toContain('aria-label="Laser Rangefinder"');
    expect(ztzEn).toContain('aria-label="Target Crossing Speed"');
    expect(ztzEn).toContain('aria-valuetext=');
    expect(ztzEn).toContain('role="status" aria-live="polite"');
    expect(tigerEn).toContain('aria-label="Optical Range Drum"');
    expect(tigerEn).toContain('role="note"');
    expect(CJK_RE.test(ztzEn)).toBe(false);
    expect(CJK_RE.test(tigerEn)).toBe(false);
  });

  it('audits WeaponStoryDrawer (expanded & minimized, EN & ZH) for valid button roles, aria-live subtitles & labeled controls', () => {
    const expandedEn = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'ak15', storyOpen: true, storyMinimized: false },
      () =>
        renderToStaticMarkup(
          React.createElement(WeaponStoryDrawer, { forceOpen: true })
        )
    );
    const minimizedEn = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'ak15', storyOpen: true, storyMinimized: true },
      () =>
        renderToStaticMarkup(
          React.createElement(WeaponStoryDrawer, { forceOpen: true })
        )
    );
    const expandedZh = withStoreSsrState(
      useAppStore,
      { lang: 'zh', activeWeaponId: 'ak15', storyOpen: true, storyMinimized: false },
      () =>
        renderToStaticMarkup(
          React.createElement(WeaponStoryDrawer, { forceOpen: true })
        )
    );
    const minimizedZh = withStoreSsrState(
      useAppStore,
      { lang: 'zh', activeWeaponId: 'ak15', storyOpen: true, storyMinimized: true },
      () =>
        renderToStaticMarkup(
          React.createElement(WeaponStoryDrawer, { forceOpen: true })
        )
    );

    assertWcagHtmlContracts(expandedEn, 'WeaponStoryDrawer expanded EN');
    assertWcagHtmlContracts(minimizedEn, 'WeaponStoryDrawer minimized EN');
    assertWcagHtmlContracts(expandedZh, 'WeaponStoryDrawer expanded ZH');
    assertWcagHtmlContracts(minimizedZh, 'WeaponStoryDrawer minimized ZH');

    // Expanded drawer always mounts persistent aria-live="polite" subtitle announcer
    expect(expandedEn).toContain('class="story-sr-only" role="status" aria-live="polite"');
    expect(expandedEn).toContain('role="dialog"');
    expect(expandedEn).toContain('aria-modal="true"');

    // Minimized floating player keeps explicit aria-label on director & rate controls (mobile hides director span text)
    expect(minimizedEn).toContain('class="story-director-mini-btn');
    expect(minimizedEn).toMatch(/story-director-mini-btn[^>]*aria-label="[^"]+"/);
    expect(minimizedEn).toMatch(/story-rate-btn[^>]*aria-label="[^"]+"/);

    expect(CJK_RE.test(stripLangSwitchPill(expandedEn))).toBe(false);
    expect(CJK_RE.test(minimizedEn)).toBe(false);

    // Source-level check: zero `<button role="listitem"` in WeaponStoryDrawer.tsx
    const drawerSrc = readRepoFile('src/features/story/WeaponStoryDrawer.tsx');
    expect(drawerSrc).not.toContain('role="listitem"');
    expect(drawerSrc).toContain('className="story-act-rail"\n            role="group"');
    expect(drawerSrc).toContain('aria-valuetext=');
  });

  it('verifies mobile <= 768px >= 34px touch targets, Blueprint Daylight, reduced-motion, balanced braces & zero WP-XX leaks across all 4 HUD CSS + 5 TSX files', () => {
    const cssFiles = [
      'src/styles/exam.css',
      'src/styles/attachment-bench.css',
      'src/styles/tank-crew.css',
      'src/styles/story.css',
    ];
    const tsxFiles = [
      'src/features/workbench/FieldStripHud.tsx',
      'src/features/workbench/MalfunctionHud.tsx',
      'src/features/workbench/AttachmentBenchPanel.tsx',
      'src/features/workbench/TankCrewHud.tsx',
      'src/features/story/WeaponStoryDrawer.tsx',
    ];

    for (const rel of cssFiles) {
      const css = readRepoFile(rel);
      expect(css, `${rel}: missing @media (max-width: 768px)`).toContain(
        '@media (max-width: 768px)'
      );
      expect(css, `${rel}: missing min-height: 34px`).toContain(
        'min-height: 34px'
      );
      expect(css, `${rel}: missing min-width: 34px`).toContain(
        'min-width: 34px'
      );
      expect(css, `${rel}: missing Blueprint Daylight rules`).toContain(
        "[data-theme='light']"
      );
      expect(css, `${rel}: missing prefers-reduced-motion`).toContain(
        '@media (prefers-reduced-motion: reduce)'
      );
      expect(WP_LEAK_RE.test(css), `${rel}: WP-XX leak found`).toBe(false);

      const openBraces = (css.match(/\{/g) ?? []).length;
      const closeBraces = (css.match(/\}/g) ?? []).length;
      expect(openBraces, `${rel}: unbalanced CSS braces`).toBe(closeBraces);
    }

    for (const rel of tsxFiles) {
      const src = readRepoFile(rel);
      expect(WP_LEAK_RE.test(src), `${rel}: WP-XX leak found`).toBe(false);
    }
  });
});
