import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Clock, Compass, GitCompareArrows, Layers, Sparkles, X } from 'lucide-react';
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
  HISTORY_TIMELINE_NODES,
  HISTORY_TIMELINE_TOURS,
  TIMELINE_LINEAGES,
  type TimelineLineageId,
  type TimelineTourId,
} from './historyTimelineSpecs';
import '../../styles/timeline-museum.css';

export interface HistoryTimelineModalProps {
  onClose: () => void;
}

const TIMELINE_STRINGS = {
  zh: {
    badge: 'WP-24 · 百年轻武器与装甲工程演化史',
    title: `${MUSEUM_TIMELINE_MIN_YEAR} – ${MUSEUM_TIMELINE_MAX_YEAR} 交互式机构专利谱系与演化时间轴`,
    subtitle: `横跨 ${MUSEUM_TIMELINE_LINEAGE_COUNT} 大机械闭锁脉系纵览全馆 ${MUSEUM_EXHIBIT_COUNT} 款名枪、复合弓弩、1:1 主战坦克与航空重武工程突破，支持精选策展导览、点击查看祖源连线与一键跳转 3D 剖视工作台`,
    close: '关闭演化时间轴',
    allLineages: `全部 ${MUSEUM_TIMELINE_LINEAGE_COUNT} 大脉系 (${MUSEUM_TIMELINE_NODE_COUNT})`,
    toursHeading: '策展主题导览路径',
    clearTour: '退出导览',
    ancestorsLabel: '机械源流追溯',
    noAncestors: '原始独立开山专利结构',
    inspect3d: '进入 3D 拆解台',
    compare3d: '启动双屏 3D 对比',
  },
  en: {
    badge: 'WP-24 · MECHANICAL EVOLUTION & LINEAGE',
    title: `${MUSEUM_TIMELINE_MIN_YEAR} - ${MUSEUM_TIMELINE_MAX_YEAR} Interactive Firearms & Armor Patent Timeline`,
    subtitle: `Explore all ${MUSEUM_EXHIBIT_COUNT} exhibits across ${MUSEUM_TIMELINE_LINEAGE_COUNT} foundational mechanical lineages with ancestry links, curated curatorial mini-tours, and one-click 3D cutaway launches`,
    close: 'Close History Timeline',
    allLineages: `All ${MUSEUM_TIMELINE_LINEAGE_COUNT} Lineages (${MUSEUM_TIMELINE_NODE_COUNT})`,
    toursHeading: 'Curated Tours',
    clearTour: 'Show All',
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
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const lang = useAppStore((s) => s.lang);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const setSectionCut = useAppStore((s) => s.setSectionCut);
  const openSplitShowdown = useAppStore((s) => s.openSplitShowdown);

  const [selectedLineage, setSelectedLineage] = useState<
    TimelineLineageId | 'all'
  >('all');
  const [activeTourId, setActiveTourId] = useState<TimelineTourId | null>(null);
  const [selectedWeaponId, setSelectedWeaponId] = useState<string>(
    activeWeaponId
  );

  const ui = TIMELINE_STRINGS[lang];
  const isZh = lang === 'zh';

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
                  const firstNode = HISTORY_TIMELINE_NODES.find(
                    (n) => n.lineageId === lin.id
                  );
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
              <button
                key={tour.id}
                type="button"
                className={`timeline-tour-pill ${
                  activeTourId === tour.id ? 'is-active' : ''
                }`}
                onClick={() => {
                  playWorkbenchFoley('preset_detent');
                  if (activeTourId === tour.id) {
                    setActiveTourId(null);
                  } else {
                    setActiveTourId(tour.id);
                    setSelectedLineage('all');
                    setSelectedWeaponId(tour.weaponIds[0]);
                  }
                }}
              >
                <Sparkles size={11} aria-hidden="true" />
                <span>{isZh ? tour.titleZh : tour.titleEn}</span>
              </button>
            ))}
          </div>

          {/* Interactive SVG Chrono-Lineage Canvas */}
          <div className="timeline-canvas-card">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="timeline-svg"
              role="img"
              aria-label={ui.title}
            >
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

              {/* Clickable Exhibit Nodes */}
              {HISTORY_TIMELINE_NODES.map((node) => {
                const pt = nodeCoords.get(node.weaponId)!;
                const isSelected = node.weaponId === selectedWeaponId;
                const dimmed =
                  (selectedLineage !== 'all' &&
                    node.lineageId !== selectedLineage) ||
                  (tourSet !== null && !tourSet.has(node.weaponId));
                const shortLabel = isWeaponId(node.weaponId)
                  ? getLocalizedShortWeaponLabel(node.weaponId, lang)
                  : node.weaponId;
                return (
                  <g
                    key={node.weaponId}
                    className="timeline-node-g"
                    style={{
                      opacity: dimmed ? 0.22 : 1,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      playWorkbenchFoley('part_select');
                      setSelectedWeaponId(node.weaponId);
                    }}
                  >
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
                onClick={() => {
                  playWorkbenchFoley('preset_detent');
                  onClose();
                  if (isWeaponId(selectedNode.weaponId)) {
                    enterWorkbench(selectedNode.weaponId, 'explode');
                    setSectionCut(true);
                  }
                }}
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
