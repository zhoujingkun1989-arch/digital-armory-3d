import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookMarked,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  GitCompareArrows,
  History,
  Layers,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useDialogAccessibility } from '../../app/useDialogAccessibility';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import {
  ENGINEERING_GLOSSARY_TERMS,
  type EngineeringGlossaryTerm,
} from '../../engine/encyclopedia/engineeringGlossary';
import {
  getLocalizedShortWeaponLabel,
  WEAPON_EN_FALLBACKS,
} from '../../i18n/weaponFallbacks';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import {
  MUSEUM_EXHIBIT_COUNT,
  MUSEUM_TIMELINE_LINEAGE_COUNT,
  MUSEUM_TIMELINE_MAX_YEAR,
  MUSEUM_TIMELINE_MIN_YEAR,
  MUSEUM_TIMELINE_NODE_COUNT,
} from '../../weapons/museumMetrics';
import { isWeaponId } from '../../weapons/types';
import {
  getTimelineEraCounts,
  HISTORY_TIMELINE_NODES,
  HISTORY_TIMELINE_TOURS,
  matchesTimelineEra,
  TIMELINE_ERAS,
  TIMELINE_LINEAGES,
  type TimelineEraId,
  type TimelineLineageId,
  type TimelineTourId,
} from './historyTimelineSpecs';
import '../../styles/timeline-museum.css';

export type TimelineModalTab = 'timeline' | 'glossary';

export interface HistoryTimelineModalProps {
  onClose: () => void;
  initialEraId?: TimelineEraId;
  initialTourId?: TimelineTourId | null;
  initialTab?: TimelineModalTab;
  initialGlossaryQuery?: string;
}

/**
 * Pure bilingual filter over all 28 engineering glossary terms, matching term
 * titles, physics explanations, canonical IDs, and linked vault exhibit names.
 */
export function filterEngineeringGlossaryTerms(
  query: string
): readonly EngineeringGlossaryTerm[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return ENGINEERING_GLOSSARY_TERMS;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return ENGINEERING_GLOSSARY_TERMS.filter((term) => {
    const weaponHaystack = term.relatedWeaponIds
      .map((wid) => {
        const m = getWeaponManifest(wid);
        const fb = WEAPON_EN_FALLBACKS[wid];
        return `${wid} ${m.shortLabel} ${m.catalog.nameCn} ${fb.shortLabel} ${fb.name}`;
      })
      .join(' ');
    const haystack =
      `${term.id.replace(/_/g, ' ')} ${term.termZh} ${term.termEn} ${term.summaryZh} ${term.summaryEn} ${weaponHaystack}`.toLowerCase();
    return tokens.every((tok) => haystack.includes(tok));
  });
}

export const TIMELINE_STRINGS = {
  zh: {
    badge: `跨世纪机械演化谱系档案 · ${MUSEUM_TIMELINE_MIN_YEAR}–${MUSEUM_TIMELINE_MAX_YEAR}`,
    title: `${MUSEUM_TIMELINE_MIN_YEAR} – ${MUSEUM_TIMELINE_MAX_YEAR} 交互式机构专利谱系与演化时间轴`,
    subtitle: `横跨 ${MUSEUM_TIMELINE_LINEAGE_COUNT} 大机械闭锁脉系纵览全馆 ${MUSEUM_EXHIBIT_COUNT} 款名枪、复合弓弩、1:1 主战坦克与航空重武工程突破，支持时代分期筛选、精选策展步进导览与一键跳转 3D 剖视工作台`,
    close: '关闭演化时间轴',
    eraHeading: '历史时期分期',
    allLineages: `全部 ${MUSEUM_TIMELINE_LINEAGE_COUNT} 大脉系 (${MUSEUM_TIMELINE_NODE_COUNT})`,
    toursHeading: '策展主题导览路径',
    clearTour: '退出导览',
    tourStopCounter: (step: number, total: number) => `第 ${step} / ${total} 站`,
    tourPrev: '上一站',
    tourNext: '下一站',
    tourLaunch3d: '在 3D 工作台检视本站',
    startLiveTour: '开启 3D 策展导览',
    startLiveTourCompact: '3D 导览',
    startLiveTourTitle:
      '关闭时间轴，在 3D 工作台按站点顺序沉浸式导览本策展全路线',
    ancestorsLabel: '机械源流追溯',
    noAncestors: '原始独立开山专利结构',
    inspect3d: '进入 3D 拆解台',
    compare3d: '启动双屏 3D 对比',
    tabTimeline: `演化时间轴 (${MUSEUM_TIMELINE_NODE_COUNT})`,
    tabGlossary: `原理词典 (${ENGINEERING_GLOSSARY_TERMS.length})`,
    tabsAria: '切换演化时间轴与机械原理百科词典',
    glossarySearchAria: '检索 28 项机械原理词条与关联馆藏',
    glossarySearchPlaceholder: '搜索原理、闭锁机构或展品 (如 滚柱、布利什、尾翼、MG 42)...',
    glossaryClearSearch: '清空检索词',
    glossaryEmptyTitle: '未找到匹配的机械原理词条',
    glossaryResetSearch: '显示全部 28 项原理',
    glossaryExhibitsCount: (n: number) => `${n} 款关联馆藏`,
    glossaryCompareLabel: '一键跳转 3D 拆解',
  },
  en: {
    badge: 'MECHANICAL EVOLUTION & PATENT ARCHIVE',
    title: `${MUSEUM_TIMELINE_MIN_YEAR} - ${MUSEUM_TIMELINE_MAX_YEAR} Interactive Firearms & Armor Patent Timeline`,
    subtitle: `Explore all ${MUSEUM_EXHIBIT_COUNT} exhibits across ${MUSEUM_TIMELINE_LINEAGE_COUNT} foundational mechanical lineages with historical era filtering, guided curatorial tour stepping, and one-click 3D cutaway launches`,
    close: 'Close History Timeline',
    eraHeading: 'Historical Eras',
    allLineages: `All ${MUSEUM_TIMELINE_LINEAGE_COUNT} Lineages (${MUSEUM_TIMELINE_NODE_COUNT})`,
    toursHeading: 'Curated Tours',
    clearTour: 'Exit Tour',
    tourStopCounter: (step: number, total: number) => `Stop ${step} / ${total}`,
    tourPrev: 'Prev',
    tourNext: 'Next',
    tourLaunch3d: 'Inspect in 3D Workbench',
    startLiveTour: 'Start Live 3D Tour',
    startLiveTourCompact: 'Live 3D',
    startLiveTourTitle:
      'Close timeline and launch this guided multi-exhibit tour inside the 3D Workbench',
    ancestorsLabel: 'Mechanical Ancestors',
    noAncestors: 'Foundational Patent Architecture',
    inspect3d: 'Inspect in 3D',
    compare3d: '3D Split-Compare',
    tabTimeline: `Patent Timeline (${MUSEUM_TIMELINE_NODE_COUNT})`,
    tabGlossary: `Glossary (${ENGINEERING_GLOSSARY_TERMS.length})`,
    tabsAria: 'Switch between Patent Timeline and Engineering Glossary',
    glossarySearchAria:
      'Search 28 mechanical engineering principles and linked exhibits',
    glossarySearchPlaceholder:
      'Search principles, lockups, or exhibits (e.g. blish, roller, sabot, ARGO)...',
    glossaryClearSearch: 'Clear glossary search',
    glossaryEmptyTitle: 'No engineering principles match this query',
    glossaryResetSearch: 'Show All 28 Principles',
    glossaryExhibitsCount: (n: number) => `${n} Exhibits`,
    glossaryCompareLabel: 'Inspect in 3D Vault',
  },
} as const;

const MIN_YEAR = MUSEUM_TIMELINE_MIN_YEAR;
const MAX_YEAR = MUSEUM_TIMELINE_MAX_YEAR;
const MODERN_START_YEAR = 1870;
const PRE_INDUSTRIAL_START_X = 0.03;
const PRE_INDUSTRIAL_END_X = 0.06;
const MODERN_START_X = 0.14;
const MODERN_END_X = 0.97;

export const TIMELINE_SCALE_BREAK_NORM_X = 0.095;
export const TIMELINE_AXIS_TICKS = [
  1415,
  1875,
  1900,
  1925,
  1950,
  1975,
  2000,
  2026,
] as const;

export const TIMELINE_SVG_METRICS = {
  width: 1080,
  height: 356,
  padL: 56,
  padR: 56,
  padT: 34,
  padB: 42,
} as const;

const SVG_W = TIMELINE_SVG_METRICS.width;
const SVG_H = TIMELINE_SVG_METRICS.height;
const PAD_L = TIMELINE_SVG_METRICS.padL;
const PAD_R = TIMELINE_SVG_METRICS.padR;
const PAD_T = TIMELINE_SVG_METRICS.padT;
const PAD_B = TIMELINE_SVG_METRICS.padB;

/**
 * Smithsonian piecewise scale-break X mapping:
 * - Anchors medieval 1415 roots cleanly on the left (`3%..6%`)
 * - Leaves open room at `9.5%` for the crisp `//` axis-break glyph
 * - Expands modern 1870–2026 industrial eras evenly across `14%..97%`
 */
export function normalizedXForYear(year: number): number {
  if (year <= MIN_YEAR) return PRE_INDUSTRIAL_START_X;
  if (year < MODERN_START_YEAR) {
    const ratio = (year - MIN_YEAR) / (MODERN_START_YEAR - MIN_YEAR);
    return (
      PRE_INDUSTRIAL_START_X +
      ratio * (PRE_INDUSTRIAL_END_X - PRE_INDUSTRIAL_START_X)
    );
  }
  const clamped = Math.min(MAX_YEAR, year);
  const ratio =
    (clamped - MODERN_START_YEAR) / (MAX_YEAR - MODERN_START_YEAR);
  return MODERN_START_X + ratio * (MODERN_END_X - MODERN_START_X);
}

export function computeTimelineTickX(year: number): number {
  return PAD_L + normalizedXForYear(year) * (SVG_W - PAD_L - PAD_R);
}

export interface TimelineNodeCoord {
  readonly x: number;
  readonly y: number;
  readonly labelBelow: boolean;
  readonly node: (typeof HISTORY_TIMELINE_NODES)[number];
  readonly color: string;
}

/**
 * Computes non-overlapping node label visibility for dense 100-node views:
 * - When `visibleIds.size <= denseThreshold` (36), every visible node shows its label.
 * - Otherwise, always shows `priorityIds` (selected, hovered, active tour) plus a
 *   greedy per-lane non-overlapping subset enforcing `>= minGapPx` (default 78px).
 */
export function selectVisibleTimelineLabels(params: {
  coords: ReadonlyMap<string, TimelineNodeCoord>;
  visibleIds: ReadonlySet<string>;
  priorityIds: ReadonlySet<string>;
  minGapPx?: number;
  denseThreshold?: number;
}): ReadonlySet<string> {
  const {
    coords,
    visibleIds,
    priorityIds,
    minGapPx = 78,
    denseThreshold = 36,
  } = params;

  if (visibleIds.size <= denseThreshold) {
    return new Set(visibleIds);
  }

  const keptIds = new Set<string>();
  const keptXsByLane = new Map<number, number[]>();

  const tryKeep = (id: string, force: boolean): void => {
    const pt = coords.get(id);
    if (!pt) return;
    const laneXs = keptXsByLane.get(pt.node.lane) ?? [];
    if (!force && laneXs.some((kx) => Math.abs(pt.x - kx) < minGapPx)) {
      return;
    }
    keptIds.add(id);
    laneXs.push(pt.x);
    keptXsByLane.set(pt.node.lane, laneXs);
  };

  for (const pid of priorityIds) {
    if (coords.has(pid)) {
      tryKeep(pid, true);
    }
  }

  const visibleByLane = new Map<number, TimelineNodeCoord[]>();
  for (const id of visibleIds) {
    if (keptIds.has(id)) continue;
    const pt = coords.get(id);
    if (!pt) continue;
    const list = visibleByLane.get(pt.node.lane);
    if (list) list.push(pt);
    else visibleByLane.set(pt.node.lane, [pt]);
  }

  for (const list of visibleByLane.values()) {
    list.sort((a, b) => a.x - b.x);
    if (list.length > 0) {
      tryKeep(list[0].node.weaponId, false);
    }
    if (list.length > 1) {
      tryKeep(list[list.length - 1].node.weaponId, false);
    }
    for (let i = 1; i < list.length - 1; i++) {
      tryKeep(list[i].node.weaponId, false);
    }
  }

  return keptIds;
}

export const HistoryTimelineModal: React.FC<HistoryTimelineModalProps> = ({
  onClose,
  initialEraId = 'all',
  initialTourId = null,
  initialTab = 'timeline',
  initialGlossaryQuery = '',
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const lang = useAppStore((s) => s.lang);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const startCuratorTour = useAppStore((s) => s.startCuratorTour);
  const setSectionCut = useAppStore((s) => s.setSectionCut);
  const openSplitShowdown = useAppStore((s) => s.openSplitShowdown);

  const [activeTab, setActiveTab] = useState<TimelineModalTab>(initialTab);
  const [glossaryQuery, setGlossaryQuery] = useState(initialGlossaryQuery);
  const [selectedEra, setSelectedEra] = useState<TimelineEraId>(initialEraId);
  const [selectedLineage, setSelectedLineage] = useState<
    TimelineLineageId | 'all'
  >('all');
  const [activeTourId, setActiveTourId] = useState<TimelineTourId | null>(
    initialTourId
  );
  const [hoveredWeaponId, setHoveredWeaponId] = useState<string | null>(null);
  const [selectedWeaponId, setSelectedWeaponId] = useState<string>(() => {
    if (initialTourId) {
      const tour = HISTORY_TIMELINE_TOURS.find((t) => t.id === initialTourId);
      if (tour?.weaponIds[0]) return tour.weaponIds[0];
    }
    return activeWeaponId;
  });

  const ui = TIMELINE_STRINGS[lang];
  const isZh = lang === 'zh';
  const eraCounts = useMemo(() => getTimelineEraCounts(), []);
  const filteredGlossaryTerms = useMemo(
    () => filterEngineeringGlossaryTerms(glossaryQuery),
    [glossaryQuery]
  );

  useDialogAccessibility({
    isOpen: true,
    containerRef: dialogRef,
    onClose,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
    return () => {
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, []);

  const lineageMap = useMemo(() => {
    const m = new Map<TimelineLineageId, (typeof TIMELINE_LINEAGES)[number]>();
    for (const l of TIMELINE_LINEAGES) m.set(l.id, l);
    return m;
  }, []);

  const nodeCoords = useMemo(() => {
    const plotW = SVG_W - PAD_L - PAD_R;
    const plotH = SVG_H - PAD_T - PAD_B;
    const minRightX = PAD_L + plotW - 10;
    const modernMinX = PAD_L + (MODERN_START_X - 0.01) * plotW;
    const map = new Map<string, TimelineNodeCoord>();
    const laneCount = TIMELINE_LINEAGES.length;
    const laneNodes = new Map<
      number,
      (typeof HISTORY_TIMELINE_NODES)[number][]
    >();

    for (const node of HISTORY_TIMELINE_NODES) {
      const list = laneNodes.get(node.lane);
      if (list) list.push(node);
      else laneNodes.set(node.lane, [node]);
    }

    for (const [lane, list] of laneNodes.entries()) {
      const sorted = [...list].sort(
        (a, b) => a.year - b.year || a.weaponId.localeCompare(b.weaponId)
      );
      const laneH = plotH / laneCount;
      const baseY = PAD_T + lane * laneH + laneH * 0.5;
      const minGap = sorted.length > 20 ? 15 : sorted.length > 12 ? 22 : 34;

      const xs = sorted.map((node) => PAD_L + normalizedXForYear(node.year) * plotW);

      // Forward pass: preserve scale-break boundary while gently spacing close neighbors
      for (let i = 1; i < sorted.length; i++) {
        const sameZone =
          (sorted[i].year < MODERN_START_YEAR) ===
          (sorted[i - 1].year < MODERN_START_YEAR);
        if (sameZone && xs[i] - xs[i - 1] < minGap) {
          xs[i] = xs[i - 1] + minGap;
        }
      }

      // Reverse pass: prevent right-edge pileup while staying right of scale-break
      if (xs.length > 0 && xs[xs.length - 1] > minRightX) {
        xs[xs.length - 1] = minRightX;
        for (let i = xs.length - 2; i >= 0; i--) {
          if (sorted[i].year < MODERN_START_YEAR) break;
          const maxAllowed = xs[i + 1] - minGap;
          if (xs[i] > maxAllowed) {
            xs[i] = Math.max(modernMinX, maxAllowed);
          }
        }
      }

      const staggerOffsets = [-8, 0, 8] as const;
      for (let idx = 0; idx < sorted.length; idx++) {
        const node = sorted[idx];
        const x = xs[idx];
        const closeToPrev = idx > 0 && x - xs[idx - 1] < 48;
        const labelBelow = idx % 2 === 1;
        const y =
          baseY +
          (closeToPrev
            ? staggerOffsets[idx % staggerOffsets.length]
            : labelBelow
              ? 3
              : -3);
        const color = lineageMap.get(node.lineageId)?.colorHex ?? '#38bdf8';
        map.set(node.weaponId, { x, y, labelBelow, node, color });
      }
    }
    return map;
  }, [lineageMap]);

  const activeTour = activeTourId
    ? HISTORY_TIMELINE_TOURS.find((t) => t.id === activeTourId) ?? null
    : null;
  const tourSet = activeTour ? new Set(activeTour.weaponIds) : null;
  const activeTourStepIndex = activeTour
    ? Math.max(0, activeTour.weaponIds.indexOf(selectedWeaponId))
    : -1;
  const activeEraSpec =
    TIMELINE_ERAS.find((e) => e.id === selectedEra) ?? TIMELINE_ERAS[0];

  const selectedCoord =
    nodeCoords.get(selectedWeaponId) ?? nodeCoords.get('ak15')!;
  const selectedNode = selectedCoord.node;
  const selectedManifest = isWeaponId(selectedNode.weaponId)
    ? getWeaponManifest(selectedNode.weaponId)
    : getWeaponManifest('ak15');
  const selectedLineageSpec = lineageMap.get(selectedNode.lineageId)!;

  const comparePartnerId =
    selectedNode.ancestors[0] ??
    (selectedNode.weaponId === 'ak15' ? 'm4a1' : 'ak15');

  const launchSelectedInWorkbench = () => {
    playWorkbenchFoley('preset_detent');
    onClose();
    if (isWeaponId(selectedNode.weaponId)) {
      enterWorkbench(selectedNode.weaponId, 'explode');
      setSectionCut(true);
    }
  };

  const launchLiveTourInWorkbench = (
    tour: (typeof HISTORY_TIMELINE_TOURS)[number],
    preferredWeaponId?: string
  ) => {
    playWorkbenchFoley('preset_detent');
    onClose();
    const targetWeaponId =
      preferredWeaponId && isWeaponId(preferredWeaponId)
        ? preferredWeaponId
        : isWeaponId(tour.weaponIds[0])
          ? tour.weaponIds[0]
          : undefined;
    startCuratorTour(tour.id, targetWeaponId);
  };

  return (
    <dialog
      ref={dialogRef}
      className="timeline-dialog"
      data-testid="history-timeline-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="timeline-shell">
        <header className="timeline-header">
          <div>
            <span className="timeline-badge">
              <Clock size={12} aria-hidden="true" />
              <span>{ui.badge}</span>
            </span>
            <h2 id={titleId} className="timeline-title">
              {ui.title}
            </h2>
            <p className="timeline-sub">{ui.subtitle}</p>
          </div>
          <button
            type="button"
            className="timeline-close-btn"
            aria-label={ui.close}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="timeline-body">
          {/* Segmented Modal View Switch: Patent Timeline vs. 28-Term Engineering Glossary */}
          <div
            className="timeline-mode-tabs"
            role="tablist"
            aria-label={ui.tabsAria}
            data-testid="timeline-modal-tabs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'timeline'}
              className={`timeline-mode-tab ${activeTab === 'timeline' ? 'is-active' : ''}`}
              data-testid="timeline-tab-timeline"
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setActiveTab('timeline');
              }}
            >
              <Clock size={13} aria-hidden="true" />
              <span>{ui.tabTimeline}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'glossary'}
              className={`timeline-mode-tab ${activeTab === 'glossary' ? 'is-active' : ''}`}
              data-testid="timeline-tab-glossary"
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setActiveTab('glossary');
              }}
            >
              <BookMarked size={13} aria-hidden="true" />
              <span>{ui.tabGlossary}</span>
            </button>
          </div>

          {activeTab === 'glossary' ? (
            <div
              className="timeline-glossary-panel"
              data-testid="timeline-glossary-panel"
            >
              <div className="timeline-glossary-toolbar">
                <div className="timeline-glossary-search-wrap">
                  <Search
                    size={14}
                    className="timeline-glossary-search-icon"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    className="timeline-glossary-search"
                    data-testid="timeline-glossary-search"
                    aria-label={ui.glossarySearchAria}
                    placeholder={ui.glossarySearchPlaceholder}
                    value={glossaryQuery}
                    onChange={(e) => setGlossaryQuery(e.target.value)}
                  />
                  {glossaryQuery.trim().length > 0 && (
                    <button
                      type="button"
                      className="timeline-glossary-clear-btn"
                      aria-label={ui.glossaryClearSearch}
                      onClick={() => setGlossaryQuery('')}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <span
                  className="timeline-glossary-count"
                  data-testid="timeline-glossary-count"
                >
                  {filteredGlossaryTerms.length} /{' '}
                  {ENGINEERING_GLOSSARY_TERMS.length}
                </span>
              </div>

              {filteredGlossaryTerms.length === 0 ? (
                <div
                  className="timeline-glossary-empty"
                  data-testid="timeline-glossary-empty"
                  role="status"
                >
                  <span>{ui.glossaryEmptyTitle}</span>
                  <button
                    type="button"
                    className="timeline-cta-btn is-primary"
                    onClick={() => setGlossaryQuery('')}
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                    <span>{ui.glossaryResetSearch}</span>
                  </button>
                </div>
              ) : (
                <div className="timeline-glossary-grid">
                  {filteredGlossaryTerms.map((term) => (
                    <article
                      key={term.id}
                      className="timeline-glossary-card"
                      data-testid={`encyclopedia-term-${term.id}`}
                    >
                      <div className="timeline-glossary-card-head">
                        <h3 className="timeline-glossary-term-title">
                          {isZh ? term.termZh : term.termEn}
                        </h3>
                        <span className="timeline-glossary-term-badge">
                          {ui.glossaryExhibitsCount(
                            term.relatedWeaponIds.length
                          )}
                        </span>
                      </div>
                      <p className="timeline-glossary-term-summary">
                        {isZh ? term.summaryZh : term.summaryEn}
                      </p>
                      <div className="timeline-glossary-card-foot">
                        <span className="timeline-glossary-foot-label">
                          {ui.glossaryCompareLabel}
                        </span>
                        <div className="timeline-glossary-jump-pills">
                          {term.relatedWeaponIds.map((relId) => {
                            const label = getLocalizedShortWeaponLabel(
                              relId,
                              lang
                            );
                            return (
                              <button
                                key={relId}
                                type="button"
                                className="timeline-glossary-jump-pill"
                                data-testid={`encyclopedia-jump-${term.id}-${relId}`}
                                onClick={() => {
                                  playWorkbenchFoley('preset_detent');
                                  onClose();
                                  enterWorkbench(relId, 'explode');
                                }}
                              >
                                <span>{label}</span>
                                <ArrowUpRight size={11} aria-hidden="true" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Interactive Historical Era Filter Strip */}
          <div
            className="timeline-era-strip"
            data-testid="timeline-era-strip"
            role="group"
            aria-label={ui.eraHeading}
          >
            <span className="timeline-tours-kicker">
              <History size={12} aria-hidden="true" />
              <span>{ui.eraHeading}:</span>
            </span>
            {TIMELINE_ERAS.map((era) => {
              const isActive = selectedEra === era.id && !activeTourId;
              return (
                <button
                  key={era.id}
                  type="button"
                  data-era-id={era.id}
                  aria-pressed={isActive}
                  title={isZh ? era.summaryZh : era.summaryEn}
                  className={`timeline-era-pill ${isActive ? 'is-active' : ''}`}
                  onClick={() => {
                    playWorkbenchFoley('preset_detent');
                    setSelectedEra(era.id);
                    setActiveTourId(null);
                    if (
                      era.id !== 'all' &&
                      !matchesTimelineEra(selectedNode.year, era.id)
                    ) {
                      const firstInEra = HISTORY_TIMELINE_NODES.find(
                        (n) =>
                          matchesTimelineEra(n.year, era.id) &&
                          (selectedLineage === 'all' ||
                            n.lineageId === selectedLineage)
                      );
                      const fallbackInEra = HISTORY_TIMELINE_NODES.find((n) =>
                        matchesTimelineEra(n.year, era.id)
                      );
                      const nextNode = firstInEra ?? fallbackInEra;
                      if (nextNode) setSelectedWeaponId(nextNode.weaponId);
                    }
                  }}
                >
                  <span className="timeline-era-range">{era.rangeLabel}</span>
                  <span>{isZh ? era.labelZh : era.labelEn}</span>
                  <span className="timeline-era-count">{eraCounts[era.id]}</span>
                </button>
              );
            })}
          </div>

          {/* Lineage Filters */}
          <div className="timeline-filter-row">
            <button
              type="button"
              className={`timeline-chip ${
                selectedLineage === 'all' && !activeTourId ? 'is-active' : ''
              }`}
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setSelectedLineage('all');
                setActiveTourId(null);
              }}
            >
              {ui.allLineages}
            </button>
            {TIMELINE_LINEAGES.map((lin) => (
              <button
                key={lin.id}
                type="button"
                className={`timeline-chip ${
                  selectedLineage === lin.id ? 'is-active' : ''
                }`}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setSelectedLineage(lin.id);
                  setActiveTourId(null);
                  const firstNode =
                    HISTORY_TIMELINE_NODES.find(
                      (n) =>
                        n.lineageId === lin.id &&
                        matchesTimelineEra(n.year, selectedEra)
                    ) ??
                    HISTORY_TIMELINE_NODES.find((n) => n.lineageId === lin.id);
                  if (firstNode) setSelectedWeaponId(firstNode.weaponId);
                }}
              >
                <span
                  className="timeline-dot"
                  style={{ background: lin.colorHex }}
                />
                <span>{isZh ? lin.labelZh : lin.labelEn}</span>
              </button>
            ))}
          </div>

          {/* Curated Mini-Tours */}
          <div className="timeline-tours-row">
            <span className="timeline-tours-kicker">
              <Compass size={12} aria-hidden="true" />
              <span>{ui.toursHeading}:</span>
            </span>
            {HISTORY_TIMELINE_TOURS.map((tour) => (
              <div
                key={tour.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <button
                  type="button"
                  className={`timeline-tour-pill ${
                    activeTourId === tour.id ? 'is-active' : ''
                  }`}
                  aria-pressed={activeTourId === tour.id}
                  onClick={() => {
                    playWorkbenchFoley('preset_detent');
                    if (activeTourId === tour.id) {
                      setActiveTourId(null);
                    } else {
                      setActiveTourId(tour.id);
                      setSelectedEra('all');
                      setSelectedLineage('all');
                      setSelectedWeaponId(tour.weaponIds[0]);
                    }
                  }}
                >
                  <Sparkles size={11} aria-hidden="true" />
                  <span>{isZh ? tour.titleZh : tour.titleEn}</span>
                </button>
                <button
                  type="button"
                  className="timeline-step-launch-btn"
                  data-testid={`timeline-start-tour-${tour.id}`}
                  style={{ padding: '4px 8px', fontSize: 10.5 }}
                  title={ui.startLiveTourTitle}
                  aria-label={`${ui.startLiveTour}: ${
                    isZh ? tour.titleZh : tour.titleEn
                  }`}
                  onClick={() => launchLiveTourInWorkbench(tour)}
                >
                  <Play size={10} aria-hidden="true" />
                  <span>{ui.startLiveTourCompact}</span>
                </button>
              </div>
            ))}
          </div>

          {/* Guided Curatorial Tour Stepper Bar */}
          {activeTour && (
            <div
              className="timeline-tour-stepper"
              data-testid="timeline-tour-stepper"
            >
              <div className="timeline-stepper-info">
                <div className="timeline-stepper-top">
                  <span className="timeline-stepper-counter tabular">
                    {ui.tourStopCounter(
                      activeTourStepIndex + 1,
                      activeTour.weaponIds.length
                    )}
                  </span>
                  <strong className="timeline-stepper-title">
                    {isZh ? activeTour.titleZh : activeTour.titleEn}
                  </strong>
                </div>
                <p className="timeline-stepper-sub">
                  {isZh ? activeTour.subtitleZh : activeTour.subtitleEn}
                </p>
                <div className="timeline-stepper-dots" role="group" aria-label={ui.toursHeading}>
                  {activeTour.weaponIds.map((wid, idx) => {
                    const isCurrent = idx === activeTourStepIndex;
                    const stopLabel = isWeaponId(wid)
                      ? getLocalizedShortWeaponLabel(wid, lang)
                      : wid;
                    return (
                      <button
                        key={wid}
                        type="button"
                        aria-current={isCurrent ? 'step' : undefined}
                        className={`timeline-step-dot ${
                          isCurrent ? 'is-active' : ''
                        }`}
                        onClick={() => {
                          playWorkbenchFoley('part_select');
                          setSelectedWeaponId(wid);
                        }}
                      >
                        <span className="timeline-step-idx">{idx + 1}</span>
                        <span>{stopLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="timeline-stepper-controls">
                <button
                  type="button"
                  className="timeline-step-nav-btn"
                  disabled={activeTourStepIndex <= 0}
                  onClick={() => {
                    if (activeTourStepIndex > 0) {
                      playWorkbenchFoley('preset_detent');
                      setSelectedWeaponId(
                        activeTour.weaponIds[activeTourStepIndex - 1]
                      );
                    }
                  }}
                >
                  <ChevronLeft size={14} aria-hidden="true" />
                  <span>{ui.tourPrev}</span>
                </button>
                <button
                  type="button"
                  className="timeline-step-nav-btn"
                  disabled={activeTourStepIndex >= activeTour.weaponIds.length - 1}
                  onClick={() => {
                    if (activeTourStepIndex < activeTour.weaponIds.length - 1) {
                      playWorkbenchFoley('preset_detent');
                      setSelectedWeaponId(
                        activeTour.weaponIds[activeTourStepIndex + 1]
                      );
                    }
                  }}
                >
                  <span>{ui.tourNext}</span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="timeline-step-launch-btn"
                  data-testid="timeline-stepper-start-live-tour"
                  onClick={() =>
                    launchLiveTourInWorkbench(activeTour, selectedNode.weaponId)
                  }
                  title={ui.startLiveTourTitle}
                >
                  <Compass size={13} aria-hidden="true" />
                  <span>{ui.startLiveTour}</span>
                </button>
                <button
                  type="button"
                  className="timeline-step-nav-btn"
                  onClick={launchSelectedInWorkbench}
                >
                  <Layers size={13} aria-hidden="true" />
                  <span>{ui.tourLaunch3d}</span>
                </button>
                <button
                  type="button"
                  className="timeline-step-exit-btn"
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    setActiveTourId(null);
                  }}
                >
                  {ui.clearTour}
                </button>
              </div>
            </div>
          )}

          {/* Interactive SVG Chrono-Lineage Canvas */}
          <div className="timeline-canvas-card">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="timeline-svg"
              role="img"
              aria-label={ui.title}
            >
              {/* Active Era Shaded Band */}
              {selectedEra !== 'all' && !activeTour && (() => {
                const plotW = SVG_W - PAD_L - PAD_R;
                const x1 = PAD_L + normalizedXForYear(activeEraSpec.minYear) * plotW;
                const x2 = PAD_L + normalizedXForYear(activeEraSpec.maxYear) * plotW;
                return (
                  <rect
                    x={Math.max(PAD_L - 12, x1 - 14)}
                    y={PAD_T - 10}
                    width={Math.max(28, x2 - x1 + 28)}
                    height={SVG_H - PAD_T - PAD_B + 16}
                    rx={8}
                    fill="rgba(56, 189, 248, 0.08)"
                    stroke="rgba(56, 189, 248, 0.28)"
                    strokeDasharray="4 4"
                  />
                );
              })()}

              {/* Year Ticks (Smithsonian Scale-Break: 1415 // 1875..2026) */}
              {TIMELINE_AXIS_TICKS.map((yr) => {
                const x = computeTimelineTickX(yr);
                return (
                  <g key={yr} data-testid={`timeline-tick-${yr}`}>
                    <line
                      x1={x}
                      y1={PAD_T}
                      x2={x}
                      y2={SVG_H - PAD_B}
                      stroke="rgba(148,163,184,0.14)"
                    />
                    <text
                      x={x}
                      y={SVG_H - 12}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="11"
                      fontFamily="monospace"
                    >
                      {yr}
                    </text>
                  </g>
                );
              })}

              {/* Smithsonian // Scale-Break Divider (1415 // 1870+) */}
              {(() => {
                const breakX =
                  PAD_L + TIMELINE_SCALE_BREAK_NORM_X * (SVG_W - PAD_L - PAD_R);
                const axisY = SVG_H - 16;
                return (
                  <g
                    data-testid="timeline-scale-break"
                    aria-hidden="true"
                  >
                    <line
                      x1={breakX}
                      y1={PAD_T}
                      x2={breakX}
                      y2={SVG_H - PAD_B}
                      stroke="rgba(148,163,184,0.28)"
                      strokeDasharray="3 5"
                    />
                    <path
                      d={`M${(breakX - 5).toFixed(1)},${axisY + 6} L${(breakX - 1).toFixed(1)},${axisY - 6} M${(breakX + 1).toFixed(1)},${axisY + 6} L${(breakX + 5).toFixed(1)},${axisY - 6}`}
                      fill="none"
                      stroke="#64748b"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })()}

              {/* Lineage swimlanes */}
              {TIMELINE_LINEAGES.map((lin, idx) => {
                const laneH = (SVG_H - PAD_T - PAD_B) / TIMELINE_LINEAGES.length;
                const cy = PAD_T + idx * laneH + laneH * 0.5;
                return (
                  <line
                    key={lin.id}
                    x1={PAD_L}
                    y1={cy}
                    x2={SVG_W - PAD_R}
                    y2={cy}
                    stroke={lin.colorHex}
                    strokeOpacity={0.18}
                    strokeDasharray="4 4"
                  />
                );
              })}

              {/* Ancestry Curve Edges */}
              {HISTORY_TIMELINE_NODES.map((node) => {
                const targetPt = nodeCoords.get(node.weaponId);
                if (!targetPt) return null;
                return node.ancestors.map((ancId) => {
                  const srcPt = nodeCoords.get(ancId);
                  if (!srcPt) return null;
                  const isHighlighted =
                    node.weaponId === selectedWeaponId ||
                    ancId === selectedWeaponId;
                  const midX = (srcPt.x + targetPt.x) * 0.5;
                  const d = `M${srcPt.x.toFixed(1)},${srcPt.y.toFixed(1)} C${midX.toFixed(1)},${srcPt.y.toFixed(1)} ${midX.toFixed(1)},${targetPt.y.toFixed(1)} ${targetPt.x.toFixed(1)},${targetPt.y.toFixed(1)}`;
                  return (
                    <path
                      key={`${ancId}->${node.weaponId}`}
                      d={d}
                      fill="none"
                      stroke={targetPt.color}
                      strokeWidth={isHighlighted ? 2.4 : 1.15}
                      strokeOpacity={isHighlighted ? 0.92 : 0.25}
                    />
                  );
                });
              })}

              {/* Active Curated Tour Route Overlay */}
              {activeTour &&
                activeTour.weaponIds.slice(0, -1).map((fromId, idx) => {
                  const toId = activeTour.weaponIds[idx + 1];
                  const fromPt = nodeCoords.get(fromId);
                  const toPt = nodeCoords.get(toId);
                  if (!fromPt || !toPt) return null;
                  const midX = (fromPt.x + toPt.x) * 0.5;
                  const d = `M${fromPt.x.toFixed(1)},${fromPt.y.toFixed(1)} C${midX.toFixed(1)},${fromPt.y.toFixed(1)} ${midX.toFixed(1)},${toPt.y.toFixed(1)} ${toPt.x.toFixed(1)},${toPt.y.toFixed(1)}`;
                  return (
                    <path
                      key={`tour-${fromId}->${toId}`}
                      d={d}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth={2.5}
                      strokeOpacity={0.82}
                      strokeDasharray="6 4"
                    />
                  );
                })}

              {/* Clickable Exhibit Nodes (Decluttered Non-Overlapping Labels in 100-Node View) */}
              {(() => {
                const visibleIds = new Set<string>();
                for (const node of HISTORY_TIMELINE_NODES) {
                  const inEra = matchesTimelineEra(node.year, selectedEra);
                  const dimmed =
                    !inEra ||
                    (selectedLineage !== 'all' &&
                      node.lineageId !== selectedLineage) ||
                    (tourSet !== null && !tourSet.has(node.weaponId));
                  if (!dimmed) visibleIds.add(node.weaponId);
                }
                const priorityIds = new Set<string>([selectedWeaponId]);
                if (hoveredWeaponId) priorityIds.add(hoveredWeaponId);
                if (activeTour) {
                  for (const tw of activeTour.weaponIds) priorityIds.add(tw);
                }
                const visibleLabelIds = selectVisibleTimelineLabels({
                  coords: nodeCoords,
                  visibleIds,
                  priorityIds,
                  minGapPx: 78,
                  denseThreshold: 36,
                });

                // Render selected & hovered nodes last so active circles & labels float above neighbors
                const orderedNodes = [...HISTORY_TIMELINE_NODES].sort((a, b) => {
                  const pa =
                    a.weaponId === selectedWeaponId
                      ? 2
                      : a.weaponId === hoveredWeaponId
                        ? 1
                        : 0;
                  const pb =
                    b.weaponId === selectedWeaponId
                      ? 2
                      : b.weaponId === hoveredWeaponId
                        ? 1
                        : 0;
                  return pa - pb;
                });

                return orderedNodes.map((node) => {
                  const pt = nodeCoords.get(node.weaponId)!;
                  const isSelected = node.weaponId === selectedWeaponId;
                  const isHovered = node.weaponId === hoveredWeaponId;
                  const dimmed = !visibleIds.has(node.weaponId);
                  const showLabel = visibleLabelIds.has(node.weaponId);
                  const tourOrder = activeTour
                    ? activeTour.weaponIds.indexOf(node.weaponId)
                    : -1;
                  const shortLabel = isWeaponId(node.weaponId)
                    ? getLocalizedShortWeaponLabel(node.weaponId, lang)
                    : node.weaponId;
                  return (
                    <g
                      key={node.weaponId}
                      className="timeline-node-g"
                      role="button"
                      tabIndex={0}
                      aria-label={`${shortLabel} (${node.year})`}
                      style={{
                        opacity: dimmed ? 0.2 : 1,
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        playWorkbenchFoley('part_select');
                        setSelectedWeaponId(node.weaponId);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          playWorkbenchFoley('part_select');
                          setSelectedWeaponId(node.weaponId);
                        }
                      }}
                      onMouseEnter={() => setHoveredWeaponId(node.weaponId)}
                      onMouseLeave={() =>
                        setHoveredWeaponId((cur) =>
                          cur === node.weaponId ? null : cur
                        )
                      }
                      onFocus={() => setHoveredWeaponId(node.weaponId)}
                      onBlur={() =>
                        setHoveredWeaponId((cur) =>
                          cur === node.weaponId ? null : cur
                        )
                      }
                    >
                      <title>{`${shortLabel} · ${node.year}`}</title>
                      {tourOrder >= 0 && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isSelected ? 14 : 11}
                          fill="none"
                          stroke="#fbbf24"
                          strokeWidth={1.6}
                          strokeOpacity={isSelected ? 0.95 : 0.55}
                        />
                      )}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected ? 9 : isHovered ? 7.5 : 5.5}
                        fill={isSelected ? pt.color : '#0f172a'}
                        stroke={pt.color}
                        strokeWidth={isSelected ? 3 : isHovered ? 2.5 : 1.8}
                      />
                      {showLabel && (
                        <text
                          x={pt.x}
                          y={pt.labelBelow ? pt.y + 18 : pt.y - 11}
                          textAnchor="middle"
                          fill={isSelected || isHovered ? '#f8fafc' : '#cbd5e1'}
                          fontSize={isSelected || isHovered ? '10.5' : '9'}
                          fontWeight={isSelected || isHovered ? 700 : 500}
                          fontFamily="sans-serif"
                          data-testid={`timeline-node-label-${node.weaponId}`}
                        >
                          {shortLabel}
                        </text>
                      )}
                    </g>
                  );
                });
              })()}
            </svg>
          </div>

          {/* Detail Spotlight Card */}
          <div className="timeline-detail-card">
            <div className="timeline-detail-main">
              <div className="timeline-detail-meta">
                <span
                  className="timeline-year-badge"
                  style={{
                    borderColor: selectedLineageSpec.colorHex,
                    color: selectedLineageSpec.colorHex,
                  }}
                >
                  {selectedNode.year}
                </span>
                <span className="timeline-bay">
                  {selectedManifest.catalog.bayCode}
                </span>
                <strong>
                  {isZh
                    ? selectedManifest.catalog.nameCn
                    : selectedManifest.catalog.subtitleEn}
                </strong>
                <span className="timeline-designer">
                  {isZh ? selectedNode.designerZh : selectedNode.designerEn}
                </span>
              </div>
              <p className="timeline-innovation">
                {isZh ? selectedNode.innovationZh : selectedNode.innovationEn}
              </p>
              <div className="timeline-ancestors-row">
                <span>{ui.ancestorsLabel}:</span>
                {selectedNode.ancestors.length === 0 ? (
                  <span className="timeline-ancestor-muted">
                    {ui.noAncestors}
                  </span>
                ) : (
                  selectedNode.ancestors.map((ancId) => (
                    <button
                      key={ancId}
                      type="button"
                      className="timeline-ancestor-chip"
                      onClick={() => {
                        playWorkbenchFoley('part_select');
                        setSelectedWeaponId(ancId);
                      }}
                    >
                      {isWeaponId(ancId)
                        ? getLocalizedShortWeaponLabel(ancId, lang)
                        : ancId}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="timeline-detail-actions">
              <button
                type="button"
                className="timeline-cta-btn is-primary"
                onClick={launchSelectedInWorkbench}
              >
                <Layers size={14} aria-hidden="true" />
                <span>{ui.inspect3d}</span>
              </button>

              <button
                type="button"
                className="timeline-cta-btn"
                onClick={() => {
                  playWorkbenchFoley('preset_detent');
                  onClose();
                  openSplitShowdown(selectedNode.weaponId, comparePartnerId);
                }}
              >
                <GitCompareArrows size={14} aria-hidden="true" />
                <span>{ui.compare3d}</span>
              </button>
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
};

export default HistoryTimelineModal;
