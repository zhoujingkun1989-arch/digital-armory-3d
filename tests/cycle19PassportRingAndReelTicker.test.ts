import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  useArmorerExamStore,
  type WeaponExamRecord,
} from '../src/engine/exam/armorerExamStore';
import {
  ArmorerPassportModal,
  computePassportMasteryRing,
  findNextUncertifiedExhibit,
} from '../src/features/passport/ArmorerPassportModal';
import {
  buildReelBroadcastMetrologyLine,
  DirectorReelModal,
} from '../src/features/video/DirectorReelModal';
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

function makeCertifiedRecord(rank: 'S' | 'A' | 'B' | 'C' = 'S'): WeaponExamRecord {
  return {
    fieldStripRank: rank,
    bestFieldStripMs: 18500,
    bestFieldStripScore: 1120,
    detailStripRank: rank,
    triageRank: rank,
    bestTriageScore: 1080,
    certifiedAt: '2026-11-24T12:00:00Z',
  };
}

describe('Cycle 19B — Armorer Passport SVG Mastery Ring & 1080p Director Reel Metrology Ticker', () => {
  it('computes exact radial SVG mastery ring geometry & rank tiers from 0/34 to 34/34', () => {
    const zero = computePassportMasteryRing(0, 34);
    expect(zero.pct).toBe(0);
    expect(zero.strokeDashoffset).toBe(zero.strokeDasharray);
    expect(zero.rankTier).toBe('NONE');

    const early = computePassportMasteryRing(3, 34);
    expect(early.pct).toBe(9);
    expect(early.rankTier).toBe('C');

    const half = computePassportMasteryRing(17, 34);
    expect(half.pct).toBe(50);
    expect(half.strokeDashoffset).toBe(
      Number((half.strokeDasharray * 0.5).toFixed(2))
    );
    expect(half.rankTier).toBe('B');

    const senior = computePassportMasteryRing(24, 34);
    expect(senior.pct).toBe(71);
    expect(senior.rankTier).toBe('A');

    const master = computePassportMasteryRing(34, 34);
    expect(master.pct).toBe(100);
    expect(master.strokeDashoffset).toBe(0);
    expect(master.rankTier).toBe('S');
  });

  it('finds the next iconic uncertified exhibit cleanly and returns null when all 34/34 are certified', () => {
    const first = findNextUncertifiedExhibit({});
    expect(first?.id).toBe('ak15');

    const afterTwo = findNextUncertifiedExhibit({
      ak15: makeCertifiedRecord('S'),
      m4a1: makeCertifiedRecord('A'),
    });
    expect(afterTwo?.id).toBe('m1911');

    const fullLedger: Record<string, WeaponExamRecord> = {};
    for (const m of WEAPON_MANIFESTS) {
      fullLedger[m.id] = makeCertifiedRecord('S');
    }
    expect(findNextUncertifiedExhibit(fullLedger)).toBeNull();
  });

  it('renders the radial SVG mastery ring, 1-click Next-Drill CTA, valid ARIA & Blueprint Daylight CSS in ArmorerPassportModal', () => {
    const enHtml = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'ak15' },
      () =>
        withStoreSsrState(useArmorerExamStore, { ledger: {} }, () =>
          renderToStaticMarkup(
            React.createElement(ArmorerPassportModal, { onClose: () => {} })
          )
        )
    );
    expect(enHtml).toContain('class="passport-mastery-svg"');
    expect(enHtml).toContain('role="img"');
    expect(enHtml).toContain('data-testid="passport-next-drill-btn"');
    expect(enHtml).toContain('Start Next Certification Drill');
    expect(enHtml).not.toContain('role="listitem"');
    expect(CJK_RE.test(enHtml)).toBe(false);

    const zhHtml = withStoreSsrState(
      useAppStore,
      { lang: 'zh', activeWeaponId: 'ak15' },
      () =>
        withStoreSsrState(useArmorerExamStore, { ledger: {} }, () =>
          renderToStaticMarkup(
            React.createElement(ArmorerPassportModal, { onClose: () => {} })
          )
        )
    );
    expect(zhHtml).toContain('开始下一项考核');

    const fullLedger: Record<string, WeaponExamRecord> = {};
    for (const m of WEAPON_MANIFESTS) {
      fullLedger[m.id] = makeCertifiedRecord('S');
    }
    const masterEnHtml = withStoreSsrState(
      useAppStore,
      { lang: 'en' },
      () =>
        withStoreSsrState(useArmorerExamStore, { ledger: fullLedger }, () =>
          renderToStaticMarkup(
            React.createElement(ArmorerPassportModal, { onClose: () => {} })
          )
        )
    );
    expect(masterEnHtml).toContain('100%');
    expect(masterEnHtml).toContain('ALL 34/34 EXHIBITS CERTIFIED');
    expect(masterEnHtml).not.toContain('data-testid="passport-next-drill-btn"');
    expect(CJK_RE.test(masterEnHtml)).toBe(false);

    const passportCss = fs.readFileSync(
      path.join(REPO_ROOT, 'src/styles/passport.css'),
      'utf8'
    );
    expect(passportCss).toContain('.passport-mastery-banner');
    expect(passportCss).toContain('.passport-ring-arc');
    expect(passportCss).toContain('.passport-next-drill-btn');
    expect(passportCss).toContain("[data-theme='light']");
    expect(passportCss).toContain('@media (max-width: 768px)');
    expect(passportCss).toContain('min-height: 36px');
    expect(passportCss).toContain('min-height: 34px');
    expect(passportCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(WP_LEAK_RE.test(passportCss)).toBe(false);
    expect((passportCss.match(/\{/g) ?? []).length).toBe(
      (passportCss.match(/\}/g) ?? []).length
    );
  });

  it('builds broadcast lower-third rifling & principle metrology tickers across m1911, g17, ztz99a, gau8, lift33 & all 34 exhibits with zero EN CJK', () => {
    const m1911En = buildReelBroadcastMetrologyLine('m1911', 'en');
    expect(m1911En).toContain('Ø11.43mm');
    expect(m1911En).toContain('6G');
    expect(m1911En).toContain('LH');

    const g17En = buildReelBroadcastMetrologyLine('g17', 'en');
    expect(g17En).toContain('Ø9mm');
    expect(g17En).toContain('6-POLYGONAL');

    const ztzEn = buildReelBroadcastMetrologyLine('ztz99a', 'en');
    expect(ztzEn).toContain('Ø125mm');
    expect(ztzEn).toContain('SMOOTHBORE');

    const gau8En = buildReelBroadcastMetrologyLine('gau8', 'en');
    expect(gau8En).toContain('Ø30mm');
    expect(gau8En).toContain('9G');
    expect(gau8En).toContain('CHROME');

    const liftEn = buildReelBroadcastMetrologyLine('lift33', 'en');
    expect(liftEn).toContain('COMPOUND CAM');
    expect(liftEn).not.toContain('BORE');

    for (const m of WEAPON_MANIFESTS) {
      const enLine = buildReelBroadcastMetrologyLine(m.id, 'en');
      const zhLine = buildReelBroadcastMetrologyLine(m.id, 'zh');
      expect(enLine.length).toBeGreaterThan(10);
      expect(zhLine.length).toBeGreaterThan(8);
      expect(CJK_RE.test(enLine), `CJK leak in EN ticker for ${m.id}`).toBe(
        false
      );
      expect(WP_LEAK_RE.test(enLine), `WP-XX leak in EN ticker for ${m.id}`).toBe(
        false
      );
      expect(WP_LEAK_RE.test(zhLine), `WP-XX leak in ZH ticker for ${m.id}`).toBe(
        false
      );
    }

    const reelEnHtml = withStoreSsrState(
      useAppStore,
      { lang: 'en', activeWeaponId: 'm1911' },
      () =>
        renderToStaticMarkup(
          React.createElement(DirectorReelModal, { onClose: () => {} })
        )
    );
    expect(reelEnHtml).toContain('data-testid="director-reel-metrology-ticker"');
    expect(reelEnHtml).toContain('Ø11.43mm');
    expect(reelEnHtml).toContain('role="status" aria-live="polite"');
    expect(CJK_RE.test(reelEnHtml)).toBe(false);

    const reelZhHtml = withStoreSsrState(
      useAppStore,
      { lang: 'zh', activeWeaponId: 'ztz99a' },
      () =>
        renderToStaticMarkup(
          React.createElement(DirectorReelModal, { onClose: () => {} })
        )
    );
    expect(reelZhHtml).toContain('滑膛');
  });

  it('keeps ArmorerPassportModal & DirectorReelModal strictly lazy-loaded in src/App.tsx with zero WP-XX leaks', () => {
    const appSrc = fs.readFileSync(path.join(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(appSrc).toMatch(
      /const\s+LazyArmorerPassportModal\s*=\s*(?:React\.)?lazy\(/
    );
    expect(appSrc).toMatch(
      /const\s+LazyDirectorReelModal\s*=\s*(?:React\.)?lazy\(/
    );
    expect(appSrc).not.toMatch(/^import\s+.*ArmorerPassportModal/m);
    expect(appSrc).not.toMatch(/^import\s+.*DirectorReelModal/m);

    for (const rel of [
      'src/features/passport/ArmorerPassportModal.tsx',
      'src/features/video/DirectorReelModal.tsx',
    ]) {
      const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect(WP_LEAK_RE.test(src), `${rel} contains WP-XX`).toBe(false);
    }
  });
});
