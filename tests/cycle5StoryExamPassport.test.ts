import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildSummaryFromRecord,
  computeExamAccuracyPct,
  type WeaponExamRecord,
} from '../src/engine/exam/armorerExamStore';
import { EXAM_STRINGS } from '../src/engine/exam/examStrings';
import {
  ArmorerPassportModal,
  computePassportHallMastery,
  filterPassportRows,
  PASSPORT_SPECIALIZED_HALLS,
} from '../src/features/passport/ArmorerPassportModal';
import { PASSPORT_STRINGS } from '../src/features/passport/passportStrings';
import { formatPlaybackRateLabel } from '../src/features/story/WeaponStoryDrawer';
import { FieldStripHud } from '../src/features/workbench/FieldStripHud';
import { MalfunctionHud } from '../src/features/workbench/MalfunctionHud';
import {
  clampNarrationPlaybackRate,
  cycleNarrationPlaybackRate,
  DOCUMENTARY_PLAYBACK_RATES,
  formatAudioTimestamp,
  getNarrationAudioSnapshot,
  MAX_NARRATION_PLAYBACK_RATE,
  MIN_NARRATION_PLAYBACK_RATE,
  setNarrationPlaybackRate,
} from '../src/narration/audioPlayer';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';
import { MUSEUM_EXHIBIT_COUNT } from '../src/weapons/museumMetrics';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const WP_LEAK_RE = /\bWP-\d{2}[a-z]?\b/i;

function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node);
  } else if (typeof node === 'function') {
    const fn = node as (...args: unknown[]) => unknown;
    let sample: unknown;
    try {
      sample = fn(45, 12, '01:05');
    } catch {
      sample = fn('S', 12, '01:05');
    }
    if (typeof sample === 'string') {
      out.push(sample);
    }
  } else if (node && typeof node === 'object') {
    for (const val of Object.values(node as Record<string, unknown>)) {
      collectStrings(val, out);
    }
  }
  return out;
}

afterEach(() => {
  setNarrationPlaybackRate(1);
});

describe('Cycle 5C — BBC/Smithsonian Documentary Player, Exam Celebration & 10-Hall Passport', () => {
  it('clamps & cycles documentary playback speeds within [0.75, 1.5] and formats mm:ss timestamps', () => {
    expect(MIN_NARRATION_PLAYBACK_RATE).toBe(0.75);
    expect(MAX_NARRATION_PLAYBACK_RATE).toBe(1.5);
    expect([...DOCUMENTARY_PLAYBACK_RATES]).toEqual([0.85, 1, 1.25]);

    expect(clampNarrationPlaybackRate(0.2)).toBe(0.75);
    expect(clampNarrationPlaybackRate(0.75)).toBe(0.75);
    expect(clampNarrationPlaybackRate(0.85)).toBe(0.85);
    expect(clampNarrationPlaybackRate(1)).toBe(1);
    expect(clampNarrationPlaybackRate(1.25)).toBe(1.25);
    expect(clampNarrationPlaybackRate(2.4)).toBe(1.5);
    expect(clampNarrationPlaybackRate(Number.NaN)).toBe(1);
    expect(clampNarrationPlaybackRate(Number.POSITIVE_INFINITY)).toBe(1);

    expect(setNarrationPlaybackRate(0.85)).toBe(0.85);
    expect(getNarrationAudioSnapshot().playbackRate).toBe(0.85);
    cycleNarrationPlaybackRate();
    expect(getNarrationAudioSnapshot().playbackRate).toBe(1);
    cycleNarrationPlaybackRate();
    expect(getNarrationAudioSnapshot().playbackRate).toBe(1.25);
    cycleNarrationPlaybackRate();
    expect(getNarrationAudioSnapshot().playbackRate).toBe(0.85);

    expect(formatPlaybackRateLabel(0.85)).toBe('0.85x');
    expect(formatPlaybackRateLabel(1)).toBe('1.0x');
    expect(formatPlaybackRateLabel(1.25)).toBe('1.25x');

    expect(formatAudioTimestamp(0)).toBe('00:00');
    expect(formatAudioTimestamp(-10)).toBe('00:00');
    expect(formatAudioTimestamp(Number.NaN)).toBe('00:00');
    expect(formatAudioTimestamp(5.8)).toBe('00:05');
    expect(formatAudioTimestamp(65)).toBe('01:05');
    expect(formatAudioTimestamp(609)).toBe('10:09');
    expect(formatAudioTimestamp(3599)).toBe('59:59');
  });

  it('wires 4-act progress rail, segmented speed controls & compact mobile guards in WeaponStoryDrawer', () => {
    const drawerSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/story/WeaponStoryDrawer.tsx'),
      'utf8'
    );
    expect(drawerSrc).toContain('story-speed-group');
    expect(drawerSrc).toContain('story-act-rail');
    expect(drawerSrc).toContain('DOCUMENTARY_PLAYBACK_RATES');
    expect(drawerSrc).toContain('formatAudioTimestamp');
    expect(drawerSrc).toContain('setNarrationPlaybackRate');

    const storyCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/story.css'),
      'utf8'
    );
    expect(storyCss).toContain('.story-speed-group');
    expect(storyCss).toContain('.story-act-rail');
    expect(storyCss).toContain('.story-act-rail-fill');
    expect(storyCss).toContain('@media (max-width: 768px)');
    expect(storyCss).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('delivers qualification seals, Passport/Poster celebration CTAs, guided next-step pulse & zero WP-XX leaks in Exam HUDs', () => {
    expect(computeExamAccuracyPct(10, 0)).toBe(100);
    expect(computeExamAccuracyPct(9, 1)).toBe(90);
    expect(computeExamAccuracyPct(4, 4)).toBe(50);
    expect(computeExamAccuracyPct(0, 0)).toBe(100);

    const fsHtml = renderToStaticMarkup(React.createElement(FieldStripHud));
    expect(fsHtml).toContain('fs-hint-btn');
    expect(fsHtml).toContain(EXAM_STRINGS.zh.common.highlightNextBtn);

    const malfHtml = renderToStaticMarkup(React.createElement(MalfunctionHud));
    expect(malfHtml).toContain('malfunction-hud');

    const fsSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/workbench/FieldStripHud.tsx'),
      'utf8'
    );
    const malfSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/workbench/MalfunctionHud.tsx'),
      'utf8'
    );
    for (const src of [fsSrc, malfSrc]) {
      expect(src).toContain('exam-qualification-seal');
      expect(src).toContain('exam-cert-summary-pill');
      expect(src).toContain('exam-cert-passport-btn');
      expect(src).toContain('openPassportModal');
      expect(src).toContain('openPosterModal');
      expect(WP_LEAK_RE.test(src)).toBe(false);
    }
    expect(fsSrc).toContain('is-hint-pulsing');

    const examCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/exam.css'),
      'utf8'
    );
    expect(examCss).toContain('.exam-qualification-seal');
    expect(examCss).toContain('.fs-step-pill.is-recommended.is-hint-pulsing');
    expect(examCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(WP_LEAK_RE.test(examCss)).toBe(false);
  });

  it('aggregates 10-Hall mastery summing cleanly to all 100 exhibits and filters Passport rows accurately', () => {
    const emptyMastery = computePassportHallMastery({});
    expect(emptyMastery.length).toBe(PASSPORT_SPECIALIZED_HALLS.length);
    const totalAcrossHalls = emptyMastery.reduce((acc, h) => acc + h.total, 0);
    expect(totalAcrossHalls).toBe(MUSEUM_EXHIBIT_COUNT);
    expect(totalAcrossHalls).toBe(100);
    expect(emptyMastery.every((h) => h.certified === 0 && h.pct === 0)).toBe(
      true
    );

    const sampleLedger: Record<string, WeaponExamRecord> = {
      ak15: {
        fieldStripRank: 'S',
        bestFieldStripMs: 18400,
        bestFieldStripScore: 1150,
        triageRank: 'A',
        bestTriageScore: 980,
        certifiedAt: '2026-11-24T00:00:00.000Z',
      },
      ztz99a: {
        fieldStripRank: 'A',
        bestFieldStripMs: 24200,
        bestFieldStripScore: 1020,
        triageRank: null,
        bestTriageScore: null,
        certifiedAt: '2026-11-24T00:00:00.000Z',
      },
      gau8: {
        fieldStripRank: 'S',
        bestFieldStripMs: 19900,
        bestFieldStripScore: 1120,
        triageRank: 'S',
        bestTriageScore: 1140,
        certifiedAt: '2026-11-24T00:00:00.000Z',
      },
      p08: {
        fieldStripRank: 'B',
        bestFieldStripMs: 29100,
        bestFieldStripScore: 810,
        triageRank: null,
        bestTriageScore: null,
        certifiedAt: '2026-11-24T00:00:00.000Z',
      },
    };

    const populated = computePassportHallMastery(sampleLedger);
    expect(populated.reduce((acc, h) => acc + h.certified, 0)).toBe(4);
    const ordnance = populated.find((h) => h.hallId === 'ordnance');
    expect(ordnance).toEqual({
      hallId: 'ordnance',
      total: 4,
      certified: 1,
      pct: 25,
    });
    const armor = populated.find((h) => h.hallId === 'armor');
    expect(armor).toEqual({
      hallId: 'armor',
      total: 8,
      certified: 1,
      pct: 13,
    });

    const rows = WEAPON_MANIFESTS.map((manifest) => ({
      manifest,
      summary: buildSummaryFromRecord(manifest.id, sampleLedger[manifest.id]),
    }));
    expect(filterPassportRows(rows, 'all', 'all').length).toBe(100);
    expect(filterPassportRows(rows, 'certified', 'all').length).toBe(4);
    expect(filterPassportRows(rows, 'pending', 'all').length).toBe(96);
    expect(filterPassportRows(rows, 'all', 'armor').length).toBe(8);
    expect(filterPassportRows(rows, 'certified', 'armor').length).toBe(1);
    expect(filterPassportRows(rows, 'pending', 'armor').length).toBe(7);
    expect(filterPassportRows(rows, 'pending', 'ordnance').length).toBe(3);

    const passportHtml = renderToStaticMarkup(
      React.createElement(ArmorerPassportModal, { onClose: () => {} })
    );
    expect(passportHtml).toContain('class="passport-halls-strip"');
    expect(passportHtml).toContain('class="passport-filter-bar"');
    expect((passportHtml.match(/class="passport-hall-card/g) ?? []).length).toBe(
      10
    );
    expect((passportHtml.match(/class="passport-train-btn"/g) ?? []).length).toBe(
      100
    );
    expect(passportHtml).toContain(PASSPORT_STRINGS.zh.launchDrillBtn);

    const passportCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/passport.css'),
      'utf8'
    );
    expect(passportCss).toContain('.passport-halls-strip');
    expect(passportCss).toContain('.passport-filter-pill');
    expect(WP_LEAK_RE.test(passportCss)).toBe(false);
  });

  it('enforces 100% zh/en parity, zero WP-XX leaks, and strictly 0 CJK in EN Exam & Passport strings', () => {
    for (const [label, bundle] of [
      ['EXAM_STRINGS.zh', EXAM_STRINGS.zh],
      ['EXAM_STRINGS.en', EXAM_STRINGS.en],
      ['PASSPORT_STRINGS.zh', PASSPORT_STRINGS.zh],
      ['PASSPORT_STRINGS.en', PASSPORT_STRINGS.en],
    ] as const) {
      const vals = collectStrings(bundle);
      expect(vals.length).toBeGreaterThan(10);
      for (const s of vals) {
        expect(WP_LEAK_RE.test(s), `WP-XX leak in ${label}: "${s}"`).toBe(
          false
        );
        if (label.endsWith('.en')) {
          expect(CJK_RE.test(s), `CJK leak in ${label}: "${s}"`).toBe(false);
        }
      }
    }

    expect(Object.keys(PASSPORT_STRINGS.zh).sort()).toEqual(
      Object.keys(PASSPORT_STRINGS.en).sort()
    );
    expect(Object.keys(PASSPORT_STRINGS.zh.halls).sort()).toEqual(
      Object.keys(PASSPORT_STRINGS.en.halls).sort()
    );
    expect(Object.keys(EXAM_STRINGS.zh.common).sort()).toEqual(
      Object.keys(EXAM_STRINGS.en.common).sort()
    );
  });
});
