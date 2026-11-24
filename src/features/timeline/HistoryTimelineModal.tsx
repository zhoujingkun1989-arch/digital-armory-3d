import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  GitCompareArrows,
  History,
  Layers,
  Play,
  Sparkles,
  X,
} from 'lucide-react';
import { useDialogAccessibility } from '../../app/useDialogAccessibility';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
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

export interface HistoryTimelineModalProps {
  onClose: () => void;
  initialEraId?: TimelineEraId;
  initialTourId?: TimelineTourId | null;
}

export const TIMELINE_STRINGS = {
  zh: {
    badge: '百年机械演化谱系档案 · 1894–2026',
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
  },
} as const;

const MIN_YEAR = MUSEUM_TIMELINE_MIN_YEAR;
const MAX_YEAR = MUSEUM_TIMELINE_MAX_YEAR;
const SVG_W = 1080;
const SVG_H = 356;
const PAD_L = 56;
const PAD_R = 56;
const PAD_T = 34;
const PAD_B = 42;

function normalizedXForYear(year: number): number {
  if (year <= 1965) {
    return ((year - MIN_YEAR) / (1965 - MIN_YEAR)) * 0.28;
  }
  if (year <= 2005) {
    return 0.28 + ((year - 1965) / (2005 - 1965)) * 0.42;
  }
  return 0.70 + ((year - 2005) / (MAX_YEAR - 2005)) * 0.30;
}

export const HistoryTimelineModal: React.FC<HistoryTimelineModalProps> = ({
  onClose,
  initialEraId = 'all',
  initialTourId = null,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const lang = useAppStore((s) => s.lang);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const startCuratorTour = useAppStore((s) => s.startCuratorTour);
  const setSectionCut = useAppStore((s) => s.setSectionCut);
  const openSplitShowdown = useAppStore((s) => s.openSplitShowdown);

  const [selectedEra, setSelectedEra] = useState<TimelineEraId>(initialEraId);
  const [selectedLineage, setSelectedLineage] = useState<
    TimelineLineageId | 'all'
  >('all');
  const [activeTourId, setActiveTourId] = useState<TimelineTourId | null>(
    initialTourId
  );
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
    const map = new Map<
      string,
      {
        x: number;
        y: number;
        labelBelow: boolean;
        node: (typeof HISTORY_TIMELINE_NODES)[number];
        color: string;
      }
    >();
    const laneCount = TIMELINE_LINEAGES.length;
    const laneNodes = new Map<number, typeof HISTORY_TIMELINE_NODES[number][]>();

    for (const node of HISTORY_TIMELINE_NODES) {
      const list = laneNodes.get(node.lane);
      if (list) list.push(node);
      else laneNodes.set(node.lane, [node]);
    }

    for (const [lane, list] of laneNodes.entries()) {
      const sorted = [...list].sort((a, b) => a.year - b.year);
      const laneH = plotH / laneCount;
      const baseY = PAD_T + lane * laneH + laneH * 0.5;
      let prevX = -999;
      let prevBelow = false;

      for (let idx = 0; idx < sorted.length; idx++) {
        const node = sorted[idx];
        let x = PAD_L + normalizedXForYear(node.year) * plotW;
        if (x - prevX < 46) {
          x = Math.min(PAD_L + plotW, prevX + 46);
        }
        const closeToPrev = x - prevX < 88;
        const labelBelow: boolean = closeToPrev ? !prevBelow : idx % 2 === 1;
        const y = baseY + (closeToPrev ? (labelBelow ? 6 : -6) : 0);
        const color = lineageMap.get(node.lineageId)?.colorHex ?? '#38bdf8';
        map.set(node.weaponId, { x, y, labelBelow, node, color });
        prevX = x;
        prevBelow = labelBelow;
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

              {/* Year Ticks */}
              {[1900, 1940, 1965, 1980, 1995, 2010, 2025].map((yr) => {
                const x =
                  PAD_L +
                  normalizedXForYear(yr) * (SVG_W - PAD_L - PAD_R);
                return (
                  <g key={yr}>
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

              {/* Clickable Exhibit Nodes */}
              {HISTORY_TIMELINE_NODES.map((node) => {
                const pt = nodeCoords.get(node.weaponId)!;
                const isSelected = node.weaponId === selectedWeaponId;
                const inEra = matchesTimelineEra(node.year, selectedEra);
                const dimmed =
                  !inEra ||
                  (selectedLineage !== 'all' &&
                    node.lineageId !== selectedLineage) ||
                  (tourSet !== null && !tourSet.has(node.weaponId));
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
                    style={{
                      opacity: dimmed ? 0.2 : 1,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      playWorkbenchFoley('part_select');
                      setSelectedWeaponId(node.weaponId);
                    }}
                  >
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
                      r={isSelected ? 9.5 : 6.5}
                      fill={isSelected ? pt.color : '#0f172a'}
                      stroke={pt.color}
                      strokeWidth={isSelected ? 3 : 2}
                    />
                    <text
                      x={pt.x}
                      y={pt.labelBelow ? pt.y + 18 : pt.y - 11}
                      textAnchor="middle"
                      fill={isSelected ? '#f8fafc' : '#cbd5e1'}
                      fontSize={isSelected ? '10.5' : '9'}
                      fontWeight={isSelected ? 700 : 500}
                      fontFamily="sans-serif"
                    >
                      {shortLabel}
                    </text>
                  </g>
                );
              })}
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
        </div>
      </div>
    </dialog>
  );
};

export default HistoryTimelineModal;
