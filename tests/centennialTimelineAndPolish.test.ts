import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatMuseumDocumentTitle } from '../src/app/useUrlStateSync';
import { VIEWPORT_RECOVERY_STRINGS } from '../src/app/ViewportErrorBoundary';
import { ARMORY_SORT_FILTER_STRINGS } from '../src/features/armory/armorySortFilter';
import {
  HistoryTimelineModal,
  TIMELINE_AXIS_TICKS,
  TIMELINE_SCALE_BREAK_NORM_X,
  TIMELINE_SVG_METRICS,
  computeTimelineTickX,
  normalizedXForYear,
  selectVisibleTimelineLabels,
  type TimelineNodeCoord,
} from '../src/features/timeline/HistoryTimelineModal';
import { HISTORY_TIMELINE_NODES } from '../src/features/timeline/historyTimelineSpecs';
import { useAppStore } from '../src/store/useAppStore';

const REPO_ROOT = path.resolve(__dirname, '..');
const CJK_OR_FULLWIDTH_RE = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const WP_LEAK_RE = /\bWP-\d+[a-z]?\b/i;

describe('100-Weapon Expansion Phase 5C-3 — Timeline Scale-Break, Offline BAY Chip & Final Copy Polish', () => {
  it('spaces all 8 Smithsonian scale-break X-axis ticks cleanly (>= 50px gap) and stays strictly monotonic from 1415 to 2026', () => {
    expect(TIMELINE_AXIS_TICKS).toEqual([
      1415,
      1875,
      1900,
      1925,
      1950,
      1975,
      2000,
      2026,
    ]);

    expect(normalizedXForYear(1415)).toBeLessThanOrEqual(0.05);
    expect(normalizedXForYear(1415)).toBeLessThan(TIMELINE_SCALE_BREAK_NORM_X);
    expect(normalizedXForYear(1870)).toBeGreaterThan(TIMELINE_SCALE_BREAK_NORM_X);
    expect(normalizedXForYear(2026)).toBeGreaterThanOrEqual(0.95);

    // Strictly monotonic across all 100 exhibit years
    const sortedYears = [...new Set(HISTORY_TIMELINE_NODES.map((n) => n.year))].sort(
      (a, b) => a - b
    );
    for (let i = 1; i < sortedYears.length; i++) {
      expect(normalizedXForYear(sortedYears[i])).toBeGreaterThan(
        normalizedXForYear(sortedYears[i - 1])
      );
    }

    // Zero colliding X-axis ticks: every adjacent pair >= 50px apart
    const tickXs = TIMELINE_AXIS_TICKS.map((yr) => computeTimelineTickX(yr));
    for (let i = 1; i < tickXs.length; i++) {
      const gap = tickXs[i] - tickXs[i - 1];
      expect(
        gap,
        `Tick ${TIMELINE_AXIS_TICKS[i - 1]} -> ${TIMELINE_AXIS_TICKS[i]} gap too narrow (${gap.toFixed(1)}px)`
      ).toBeGreaterThanOrEqual(50);
    }

    // Break glyph sits cleanly between 1415 and 1875 ticks
    const plotW =
      TIMELINE_SVG_METRICS.width -
      TIMELINE_SVG_METRICS.padL -
      TIMELINE_SVG_METRICS.padR;
    const breakX =
      TIMELINE_SVG_METRICS.padL + TIMELINE_SCALE_BREAK_NORM_X * plotW;
    expect(breakX - tickXs[0]).toBeGreaterThanOrEqual(35);
    expect(tickXs[1] - breakX).toBeGreaterThanOrEqual(35);
  });

  it('declutters 100-node SVG labels per lane (>= 72px spacing) while always preserving selected, hovered, tour & small-filter labels', () => {
    const plotW =
      TIMELINE_SVG_METRICS.width -
      TIMELINE_SVG_METRICS.padL -
      TIMELINE_SVG_METRICS.padR;
    const coords = new Map<string, TimelineNodeCoord>();
    for (const node of HISTORY_TIMELINE_NODES) {
      coords.set(node.weaponId, {
        x: TIMELINE_SVG_METRICS.padL + normalizedXForYear(node.year) * plotW,
        y: 60 + node.lane * 44,
        labelBelow: false,
        node,
        color: '#38bdf8',
      });
    }

    const allVisible = new Set(HISTORY_TIMELINE_NODES.map((n) => n.weaponId));
    const priorityIds = new Set(['ak47', 't90m']);
    const keptDense = selectVisibleTimelineLabels({
      coords,
      visibleIds: allVisible,
      priorityIds,
      minGapPx: 78,
      denseThreshold: 36,
    });

    // Priority nodes always shown; dense full-archive view declutters well below 100 overlapping labels
    expect(keptDense.has('ak47')).toBe(true);
    expect(keptDense.has('t90m')).toBe(true);
    expect(keptDense.size).toBeLessThan(70);
    expect(keptDense.size).toBeGreaterThanOrEqual(12);

    // Every pair of non-priority labeled nodes in the same lane respects >= 72px horizontal separation
    const nonPriorityByLane = new Map<number, number[]>();
    for (const id of keptDense) {
      if (priorityIds.has(id)) continue;
      const pt = coords.get(id)!;
      const list = nonPriorityByLane.get(pt.node.lane) ?? [];
      list.push(pt.x);
      nonPriorityByLane.set(pt.node.lane, list);
    }
    for (const [lane, xs] of nonPriorityByLane.entries()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) {
        expect(
          xs[i] - xs[i - 1],
          `Lane ${lane} overlapping labels (${(xs[i] - xs[i - 1]).toFixed(1)}px)`
        ).toBeGreaterThanOrEqual(72);
      }
    }

    // Small filtered view (<= 36 nodes) retains 100% of visible labels
    const smallSubset = new Set(
      HISTORY_TIMELINE_NODES.slice(0, 12).map((n) => n.weaponId)
    );
    const keptSmall = selectVisibleTimelineLabels({
      coords,
      visibleIds: smallSubset,
      priorityIds: new Set(['ak15']),
    });
    expect(keptSmall.size).toBe(12);

    // Live SSR verification of HistoryTimelineModal: scale-break glyph, 8 ticks, 100 focusable nodes, decluttered labels
    const prevLang = useAppStore.getState().lang;
    try {
      useAppStore.setState({ lang: 'en', activeWeaponId: 'ak15' });
      const html = renderToStaticMarkup(
        React.createElement(HistoryTimelineModal, { onClose: () => {} })
      );
      expect(html).toContain('data-testid="timeline-scale-break"');
      for (const yr of TIMELINE_AXIS_TICKS) {
        expect(html).toContain(`data-testid="timeline-tick-${yr}"`);
      }
      const nodeCount = (html.match(/class="timeline-node-g"/g) ?? []).length;
      const labelCount = (html.match(/data-testid="timeline-node-label-/g) ?? [])
        .length;
      expect(nodeCount).toBe(100);
      expect(labelCount).toBeLessThan(70);
      expect(html).toContain('data-testid="timeline-node-label-ak15"');
      expect(html).toContain('<title>');
    } finally {
      useAppStore.setState({ lang: prevLang });
    }
  });

  it('prevents .offline-bay BAY-XX chip wrapping in offline-museum.css and removes all stale 34-Bay / 1894→ live copy', () => {
    const offlineCss = fs.readFileSync(
      path.join(REPO_ROOT, 'src/styles/offline-museum.css'),
      'utf8'
    );
    const bayRuleMatch = offlineCss.match(/\.offline-bay\s*\{[^}]+\}/);
    expect(bayRuleMatch).not.toBeNull();
    expect(bayRuleMatch![0]).toContain('white-space: nowrap');
    expect(bayRuleMatch![0]).toContain('flex-shrink: 0');

    // Document title SSOT (useUrlStateSync)
    const enTitle = formatMuseumDocumentTitle('armory', 'ak15', 'en');
    const zhTitle = formatMuseumDocumentTitle('armory', 'ak15', 'zh');
    expect(enTitle).toContain('100-Bay Mechanical Vault');
    expect(enTitle).not.toContain('34-Bay');
    expect(CJK_OR_FULLWIDTH_RE.test(enTitle)).toBe(false);
    expect(zhTitle).toContain('100 槽 10 展厅数字兵器库');
    expect(zhTitle).not.toContain('34 槽');

    // ViewportErrorBoundary SSOT
    expect(VIEWPORT_RECOVERY_STRINGS.en.runtimeDesc).toContain('100-Bay Vault');
    expect(VIEWPORT_RECOVERY_STRINGS.en.returnVaultBtn).toBe(
      'Return to 100-Bay Vault'
    );
    expect(VIEWPORT_RECOVERY_STRINGS.en.runtimeDesc).not.toContain('34-Bay');
    expect(VIEWPORT_RECOVERY_STRINGS.zh.runtimeDesc).toContain('100 展位兵器库');
    expect(VIEWPORT_RECOVERY_STRINGS.zh.runtimeDesc).not.toContain('34 展位');
    for (const s of Object.values(VIEWPORT_RECOVERY_STRINGS.en)) {
      expect(CJK_OR_FULLWIDTH_RE.test(s)).toBe(false);
      expect(WP_LEAK_RE.test(s)).toBe(false);
    }

    // Armory sort dropdown year_asc label (1415→)
    expect(ARMORY_SORT_FILTER_STRINGS.zh.sortOptions.year_asc).toContain('1415→');
    expect(ARMORY_SORT_FILTER_STRINGS.en.sortOptions.year_asc).toContain('1415→');
    expect(ARMORY_SORT_FILTER_STRINGS.zh.sortOptions.year_asc).not.toContain(
      '1894→'
    );
    expect(ARMORY_SORT_FILTER_STRINGS.en.sortOptions.year_asc).not.toContain(
      '1894→'
    );
  });
});
