import React, { useId } from 'react';
import {
  getArcheryProjectileMeta,
  type CartridgeLabSpec,
} from '../../engine/cartridges/cartridgeSpecs';
import type { LanguageCode } from '../../narration/types';
import {
  computeDkCartridgePlateLayout,
  DK_PALETTE,
  type DkEraRelation,
  type DkLoupePlateKey,
  type DkLoupeSpec,
  type DkScaleReference,
  type DkTimelineNode,
} from './dkEditorialData';

// ============================================================================
// DK Visual Encyclopedia — Print-Grade Pure Vector SVG React Components
// Design System: Archival Ink #111827 · DK Crimson #B91C1C · Brass #9A6B2F ·
// Hairline Slate #64748B · Tabular Numerals · Zero Blurry Drop Shadows
// ============================================================================

const SANS_FONT =
  "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const MONO_FONT =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

function clamp01(v: number, min = 0.02, max = 0.98): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(min, Math.min(max, v));
}

// ----------------------------------------------------------------------------
// 1. DkAnnotatedPlateOverlay — 0.35pt Hairline Elbow Leaders & Margin Callouts
// ----------------------------------------------------------------------------

export interface DkAnnotatedCalloutSpec {
  partId: string;
  bomCode: string;
  side: 'top' | 'bottom' | 'left' | 'right';
  anchorU: number;
  anchorV: number;
  kneeU: number;
  kneeV: number;
  labelU: number;
  labelV: number;
  align: 'left' | 'right' | 'center';
  title: string;
  microCopy: string;
}

export interface DkAnnotatedPlateOverlayProps {
  callouts: readonly DkAnnotatedCalloutSpec[];
  /** Coordinate viewBox aspect matching 16:10 captured plates (default 1000×625) */
  viewWidth?: number;
  viewHeight?: number;
  /** Accent ink for target center dots and BOM tags (default DK crimson #B91C1C) */
  accentColor?: string;
  /** Compact mode omits secondary micro-copy line for small plates */
  compact?: boolean;
  className?: string;
}

export const DkAnnotatedPlateOverlay: React.FC<DkAnnotatedPlateOverlayProps> = ({
  callouts,
  viewWidth = 1000,
  viewHeight = 625,
  accentColor = DK_PALETTE.crimson,
  compact = false,
  className = '',
}) => {
  if (!callouts || callouts.length === 0) {
    return null;
  }

  return (
    <div
      className={`dk-annotated-plate-overlay ${className}`.trim()}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'visible',
        fontFamily: SANS_FONT,
      }}
    >
      {/* Pure Vector 0.6px (0.35pt print) Hairline Leader Lines & Hollow Anchor Rings */}
      <svg
        className="dk-annotated-leaders-svg"
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          display: 'block',
        }}
      >
        {callouts.map((c) => {
          const ax = clamp01(c.anchorU, 0.01, 0.99) * viewWidth;
          const ay = clamp01(c.anchorV, 0.01, 0.99) * viewHeight;
          const kx = clamp01(c.kneeU, 0.01, 0.99) * viewWidth;
          const ky = clamp01(c.kneeV, 0.01, 0.99) * viewHeight;
          const lx = clamp01(c.labelU, 0.01, 0.99) * viewWidth;
          const ly = clamp01(c.labelV, 0.01, 0.99) * viewHeight;

          const pathD = `M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${kx.toFixed(1)} ${ky.toFixed(1)} L ${lx.toFixed(1)} ${ly.toFixed(1)}`;
          const tickHalf = 8;
          const tickX1 =
            c.align === 'left'
              ? lx
              : c.align === 'right'
                ? lx - tickHalf * 2
                : lx - tickHalf;
          const tickX2 =
            c.align === 'left'
              ? lx + tickHalf * 2
              : c.align === 'right'
                ? lx
                : lx + tickHalf;

          return (
            <g key={c.partId} className="dk-callout-leader-group">
              {/* Crisp white under-stroke so hairline reads clearly over dark steel */}
              <path
                d={pathD}
                fill="none"
                stroke={DK_PALETTE.paper}
                strokeWidth={2.0}
                strokeOpacity={0.86}
                strokeLinejoin="miter"
                vectorEffect="non-scaling-stroke"
              />
              {/* 0.6px (0.35pt) DK architectural charcoal leader line */}
              <path
                d={pathD}
                fill="none"
                stroke={DK_PALETTE.ink}
                strokeWidth={0.6}
                strokeOpacity={0.92}
                strokeLinejoin="miter"
                vectorEffect="non-scaling-stroke"
              />
              {/* Subtle serif terminus tick where leader meets label */}
              <line
                x1={tickX1}
                y1={ly}
                x2={tickX2}
                y2={ly}
                stroke={accentColor}
                strokeWidth={1.1}
                vectorEffect="non-scaling-stroke"
              />
              {/* Outer white contrast halo on the part */}
              <circle
                cx={ax}
                cy={ay}
                r={4.6}
                fill={DK_PALETTE.paper}
                fillOpacity={0.92}
              />
              {/* Crisp hollow-center anchor ring (r=3.2) */}
              <circle
                cx={ax}
                cy={ay}
                r={3.2}
                fill={DK_PALETTE.paper}
                stroke={DK_PALETTE.ink}
                strokeWidth={1.05}
              />
              {/* Surgical crimson pinpoint center */}
              <circle cx={ax} cy={ay} r={1.35} fill={accentColor} />
            </g>
          );
        })}
      </svg>

      {/* Non-overlapping DK Editorial Margin Labels (<= 12.5mm compact print footprint) */}
      {(() => {
        const sideCounts = {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        };
        for (const item of callouts) {
          sideCounts[item.side]++;
        }

        return callouts.map((c) => {
          const leftPct = clamp01(c.labelU, 0.015, 0.985) * 100;
          const topPct = clamp01(c.labelV, 0.015, 0.985) * 100;

          const tx =
            c.align === 'left' ? '0%' : c.align === 'right' ? '-100%' : '-50%';
          const ty =
            c.side === 'top'
              ? 'calc(-100% - 2.5px)'
              : c.side === 'bottom'
                ? '2.5px'
                : '-50%';
          const sideOffsetX =
            c.side === 'left' ? '-5px' : c.side === 'right' ? '5px' : '0px';

          const countOnSide = sideCounts[c.side];
          const maxWidth =
            c.side === 'left' || c.side === 'right'
              ? '21%'
              : countOnSide <= 4
                ? '22%'
                : countOnSide === 5
                  ? '18.5%'
                  : '15.8%';

          return (
            <div
              key={`label-${c.partId}`}
              className={`dk-callout-label is-side-${c.side} is-align-${c.align}`}
              style={{
                position: 'absolute',
                left: `${leftPct.toFixed(2)}%`,
                top: `${topPct.toFixed(2)}%`,
                transform: `translate(calc(${tx} + ${sideOffsetX}), ${ty})`,
                textAlign: c.align,
                maxWidth,
                minWidth: '72px',
                maxHeight: '16.5mm',
                padding: compact ? '1px 4px' : '1.5px 5px',
                backgroundColor: 'rgba(255, 255, 255, 0.92)',
                boxSizing: 'border-box',
                lineHeight: 1.14,
                overflow: 'hidden',
              }}
            >
              <div
                className="dk-callout-head"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  lineHeight: 1.14,
                }}
              >
                <span
                  className="dk-callout-bom"
                  style={{
                    fontFamily: MONO_FONT,
                    fontSize: compact ? '5.4pt' : '5.8pt',
                    fontWeight: 800,
                    letterSpacing: '0.03em',
                    color: accentColor,
                    fontVariantNumeric: 'tabular-nums',
                    marginRight: '3.5px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.bomCode}
                </span>
                <strong
                  className="dk-callout-title"
                  style={{
                    fontSize: compact ? '6pt' : '6.4pt',
                    fontWeight: 800,
                    color: DK_PALETTE.ink,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {c.title}
                </strong>
              </div>
              {!compact && c.microCopy && (
                <p
                  className="dk-callout-microcopy"
                  style={{
                    margin: '1px 0 0 0',
                    fontSize: '5.5pt',
                    fontWeight: 400,
                    color: DK_PALETTE.inkSecondary,
                    lineHeight: 1.18,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {c.microCopy}
                </p>
              )}
            </div>
          );
        });
      })()}
    </div>
  );
};

// ----------------------------------------------------------------------------
// 2. DkCircularLoupeStrip & Optional Hero Connector Overlay
// ----------------------------------------------------------------------------

export interface DkLoupeAnchorPoint {
  u: number;
  v: number;
}

export interface DkCircularLoupeStripProps {
  loupes: readonly DkLoupeSpec[];
  plates: Partial<Record<DkLoupePlateKey | string, string>> | null | undefined;
  /** Optional normalized [0..1]×[0..1] hero plate anchor positions for dashed connectors */
  loupeAnchors?: Partial<Record<DkLoupePlateKey, DkLoupeAnchorPoint>>;
  /** Position of the hero plate relative to this loupe strip (default 'above') */
  heroRelation?: 'above' | 'below' | 'none';
  /** Circular optical frame diameter in CSS px (default 92) */
  diameterPx?: number;
  placeholderLabel?: string;
  lang?: LanguageCode;
  className?: string;
}

export const DkLoupeHeroConnectorOverlay: React.FC<{
  loupes: readonly DkLoupeSpec[];
  loupeAnchors?: Partial<Record<DkLoupePlateKey, DkLoupeAnchorPoint>>;
  stripEdge?: 'bottom' | 'top';
  viewWidth?: number;
  viewHeight?: number;
  className?: string;
}> = ({
  loupes,
  loupeAnchors,
  stripEdge = 'bottom',
  viewWidth = 1000,
  viewHeight = 625,
  className = '',
}) => {
  if (!loupeAnchors || loupes.length === 0) return null;

  const activeItems = loupes
    .map((loupe, idx) => ({
      loupe,
      idx,
      anchor: loupeAnchors[loupe.plateKey],
    }))
    .filter(
      (item): item is { loupe: DkLoupeSpec; idx: number; anchor: DkLoupeAnchorPoint } =>
        Boolean(item.anchor)
    );

  if (activeItems.length === 0) return null;

  const targetY = stripEdge === 'bottom' ? viewHeight - 2 : 2;
  const n = loupes.length;

  return (
    <svg
      className={`dk-loupe-hero-connector-svg ${className}`.trim()}
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {activeItems.map(({ loupe, idx, anchor }) => {
        const ax = clamp01(anchor.u, 0.03, 0.97) * viewWidth;
        const ay = clamp01(anchor.v, 0.05, 0.95) * viewHeight;
        const slotX = ((idx + 0.5) / n) * viewWidth;
        const midY =
          stripEdge === 'bottom'
            ? Math.min(viewHeight - 16, ay + (targetY - ay) * 0.62)
            : Math.max(16, ay - (ay - targetY) * 0.62);

        return (
          <g key={loupe.plateKey}>
            <circle
              cx={ax}
              cy={ay}
              r={10}
              fill="none"
              stroke={DK_PALETTE.brass}
              strokeWidth={0.9}
              strokeDasharray="2.5 2"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={ax}
              cy={ay}
              r={2.2}
              fill={DK_PALETTE.crimson}
              stroke={DK_PALETTE.paper}
              strokeWidth={0.8}
            />
            <path
              d={`M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${ax.toFixed(1)} ${midY.toFixed(1)} L ${slotX.toFixed(1)} ${midY.toFixed(1)} L ${slotX.toFixed(1)} ${targetY.toFixed(1)}`}
              fill="none"
              stroke={DK_PALETTE.muted}
              strokeWidth={0.75}
              strokeDasharray="3 2.5"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </svg>
  );
};

export const DkCircularLoupeStrip: React.FC<DkCircularLoupeStripProps> = ({
  loupes,
  plates,
  loupeAnchors,
  heroRelation = 'above',
  diameterPx = 92,
  placeholderLabel,
  lang = 'zh',
  className = '',
}) => {
  if (!loupes || loupes.length === 0) return null;

  const hasAnchors =
    heroRelation !== 'none' &&
    Boolean(
      loupeAnchors &&
        loupes.some((l) => Boolean(loupeAnchors[l.plateKey]))
    );

  const n = loupes.length;
  const fallbackPlaceholder =
    placeholderLabel ?? (lang === 'zh' ? '特写抓拍中' : 'CAPTURING');

  // Generate 12 delicate radial optical loupe ticks around the perimeter
  const tickAngles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

  const renderConnectorBridge = () => {
    if (!hasAnchors || !loupeAnchors) return null;
    const isHeroAbove = heroRelation === 'above';
    const yHero = isHeroAbove ? 3 : 33;
    const yLoupe = isHeroAbove ? 33 : 3;

    return (
      <div
        className="dk-loupe-connector-bridge-wrap"
        style={{
          position: 'relative',
          width: '100%',
          height: '24px',
        }}
      >
        <svg
          className="dk-loupe-connector-bridge"
          viewBox="0 0 1000 36"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            overflow: 'visible',
          }}
        >
          {loupes.map((loupe, idx) => {
            const anchor = loupeAnchors[loupe.plateKey];
            if (!anchor) return null;
            const ax = clamp01(anchor.u, 0.04, 0.96) * 1000;
            const lx = ((idx + 0.5) / n) * 1000;
            const bendY = isHeroAbove
              ? 11 + (idx % 2) * 7
              : 25 - (idx % 2) * 7;

            return (
              <path
                key={loupe.plateKey}
                d={`M ${ax.toFixed(1)} ${yHero} L ${ax.toFixed(1)} ${bendY} L ${lx.toFixed(1)} ${bendY} L ${lx.toFixed(1)} ${yLoupe}`}
                fill="none"
                stroke={DK_PALETTE.muted}
                strokeWidth={0.85}
                strokeDasharray="3 2.5"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {/* Aspect-invariant circular anchor & loupe terminus pins */}
        {loupes.map((loupe, idx) => {
          const anchor = loupeAnchors[loupe.plateKey];
          if (!anchor) return null;
          const axPct = clamp01(anchor.u, 0.04, 0.96) * 100;
          const lxPct = ((idx + 0.5) / n) * 100;
          return (
            <React.Fragment key={`pin-${loupe.plateKey}`}>
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: `${axPct.toFixed(2)}%`,
                  top: isHeroAbove ? '2px' : 'calc(100% - 2px)',
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  backgroundColor: DK_PALETTE.crimson,
                  transform: 'translate(-50%, -50%)',
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: `${lxPct.toFixed(2)}%`,
                  top: isHeroAbove ? 'calc(100% - 2px)' : '2px',
                  width: '4.5px',
                  height: '4.5px',
                  borderRadius: '50%',
                  backgroundColor: DK_PALETTE.paper,
                  border: `1px solid ${DK_PALETTE.ink}`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <section
      className={`dk-circular-loupe-strip ${className}`.trim()}
      style={{
        width: '100%',
        fontFamily: SANS_FONT,
        color: DK_PALETTE.ink,
      }}
    >
      {heroRelation === 'above' && renderConnectorBridge()}

      <div
        className="dk-loupe-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
          gap: '10px',
          alignItems: 'start',
        }}
      >
        {loupes.map((loupe) => {
          const imgSrc = plates?.[loupe.plateKey];

          return (
            <figure
              key={loupe.plateKey}
              className="dk-loupe-card"
              style={{
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              {/* Circular Optical Frame + Clipped Plate + Crimson Magnification Pill */}
              <div
                className="dk-loupe-lens-wrap"
                style={{
                  position: 'relative',
                  width: `${diameterPx}px`,
                  height: `${diameterPx}px`,
                  flexShrink: 0,
                }}
              >
                {/* Clipped circular photography viewport */}
                <div
                  className="dk-loupe-image-disc"
                  style={{
                    position: 'absolute',
                    inset: '5px',
                    borderRadius: '50%',
                    clipPath: 'circle(50% at 50% 50%)',
                    backgroundColor: DK_PALETTE.paperTint,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={loupe.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                        transform: `scale(${loupe.plateKey === 'breech_closeup' ? 1.06 : 1.24})`,
                        transformOrigin: 'center center',
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        fontFamily: MONO_FONT,
                        fontSize: '6pt',
                        fontWeight: 700,
                        color: DK_PALETTE.muted,
                        letterSpacing: '0.06em',
                      }}
                    >
                      {fallbackPlaceholder}
                    </span>
                  )}
                </div>

                {/* Precision Optical Reticle Hairline Ring SVG */}
                <svg
                  viewBox="0 0 100 100"
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                  }}
                >
                  {/* Outer archival charcoal ring */}
                  <circle
                    cx={50}
                    cy={50}
                    r={48.2}
                    fill="none"
                    stroke={DK_PALETTE.ink}
                    strokeWidth={0.85}
                  />
                  {/* Inner brass collar ring around lens edge */}
                  <circle
                    cx={50}
                    cy={50}
                    r={44.6}
                    fill="none"
                    stroke={DK_PALETTE.brass}
                    strokeWidth={0.65}
                    strokeOpacity={0.8}
                  />
                  {/* Subtle calibrated radial ticks */}
                  {tickAngles.map((deg) => {
                    const rad = (deg * Math.PI) / 180;
                    const isCardinal = deg % 90 === 0;
                    const rOuter = 48.2;
                    const rInner = isCardinal ? 44.6 : 46.1;
                    const x1 = 50 + Math.cos(rad) * rInner;
                    const y1 = 50 + Math.sin(rad) * rInner;
                    const x2 = 50 + Math.cos(rad) * rOuter;
                    const y2 = 50 + Math.sin(rad) * rOuter;
                    return (
                      <line
                        key={deg}
                        x1={x1.toFixed(2)}
                        y1={y1.toFixed(2)}
                        x2={x2.toFixed(2)}
                        y2={y2.toFixed(2)}
                        stroke={isCardinal ? DK_PALETTE.crimson : DK_PALETTE.muted}
                        strokeWidth={isCardinal ? 1.1 : 0.65}
                      />
                    );
                  })}
                </svg>

                {/* DK Crimson Magnification Badge */}
                <span
                  className="dk-loupe-mag-pill"
                  style={{
                    position: 'absolute',
                    right: '-2px',
                    bottom: '2px',
                    padding: '1.5px 5.5px',
                    borderRadius: '999px',
                    backgroundColor: DK_PALETTE.crimson,
                    color: DK_PALETTE.paper,
                    border: `1.2px solid ${DK_PALETTE.paper}`,
                    fontFamily: MONO_FONT,
                    fontSize: '6.6pt',
                    fontWeight: 800,
                    lineHeight: 1.15,
                    letterSpacing: '0.02em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {loupe.magnification}
                </span>
              </div>

              {/* Loupe Editorial Caption */}
              <figcaption
                style={{
                  marginTop: '6px',
                  width: '100%',
                  borderTop: `0.75px solid ${DK_PALETTE.rule}`,
                  paddingTop: '4px',
                }}
              >
                <div
                  className="dk-loupe-title"
                  style={{
                    fontSize: '7.5pt',
                    fontWeight: 800,
                    color: DK_PALETTE.ink,
                    lineHeight: 1.2,
                  }}
                >
                  {loupe.title}
                </div>
                <p
                  className="dk-loupe-caption"
                  style={{
                    margin: '2px 0 0 0',
                    fontSize: '6.4pt',
                    color: DK_PALETTE.inkSecondary,
                    lineHeight: 1.3,
                  }}
                >
                  {loupe.caption}
                </p>
              </figcaption>
            </figure>
          );
        })}
      </div>

      {heroRelation === 'below' && renderConnectorBridge()}
    </section>
  );
};

// ----------------------------------------------------------------------------
// 3. DkTrueScaleRuler — Dual Metric/Imperial Calibrated Ruler + Silhouette
// ----------------------------------------------------------------------------

export interface DkTrueScaleRulerProps {
  scaleRef: DkScaleReference;
  lang: LanguageCode;
  exhibitLabel?: string;
  isArchery?: boolean;
  className?: string;
}

function chooseMetricRulerSpanCm(oalMm: number): {
  maxCm: number;
  majorStepCm: number;
  minorStepCm: number;
} {
  const oalCm = oalMm / 10;
  if (oalCm <= 25) return { maxCm: 25, majorStepCm: 5, minorStepCm: 1 };
  if (oalCm <= 35) return { maxCm: 35, majorStepCm: 5, minorStepCm: 1 };
  if (oalCm <= 60) return { maxCm: 60, majorStepCm: 10, minorStepCm: 2 };
  if (oalCm <= 80) return { maxCm: 80, majorStepCm: 10, minorStepCm: 2 };
  if (oalCm <= 100) return { maxCm: 100, majorStepCm: 20, minorStepCm: 5 };
  if (oalCm <= 120) return { maxCm: 120, majorStepCm: 20, minorStepCm: 5 };
  if (oalCm <= 150) return { maxCm: 150, majorStepCm: 30, minorStepCm: 5 };
  const ceil50 = Math.ceil(oalCm / 50) * 50;
  return { maxCm: ceil50, majorStepCm: 50, minorStepCm: 10 };
}

export const DkTrueScaleRuler: React.FC<DkTrueScaleRulerProps> = ({
  scaleRef,
  lang,
  exhibitLabel,
  isArchery = false,
  className = '',
}) => {
  const isZh = lang === 'zh';
  const W = 660;
  const H = 132;

  const { maxCm, majorStepCm, minorStepCm } = chooseMetricRulerSpanCm(
    scaleRef.oalMm
  );
  const maxMm = maxCm * 10;
  const maxInches = maxMm / 25.4;
  const inchMajorStep = maxInches <= 14 ? 2 : maxInches <= 36 ? 5 : 10;
  const inchMinorStep = inchMajorStep <= 2 ? 0.5 : inchMajorStep <= 5 ? 1 : 2;

  const rulerX0 = 20;
  const rulerW = 430;
  const pxPerMm = rulerW / maxMm;

  const oalBarW = Math.max(4, Math.min(rulerW, scaleRef.oalMm * pxPerMm));
  const barrelClampedMm = Math.min(scaleRef.oalMm, Math.max(0, scaleRef.barrelMm));
  const barrelBarW = Math.max(2, barrelClampedMm * pxPerMm);

  const metricY = 38;
  const barY = 52;
  const barH = 14;
  const imperialY = 86;

  // Build metric ticks
  const metricTicks: { cm: number; x: number; isMajor: boolean }[] = [];
  for (let cm = 0; cm <= maxCm + 0.001; cm += minorStepCm) {
    const rounded = Math.round(cm * 10) / 10;
    const isMajor = Math.abs(rounded % majorStepCm) < 0.01;
    metricTicks.push({
      cm: rounded,
      x: rulerX0 + rounded * 10 * pxPerMm,
      isMajor,
    });
  }

  // Build imperial ticks (exact 25.4 mm = 1 in alignment)
  const imperialTicks: { inch: number; x: number; isMajor: boolean }[] = [];
  for (let inch = 0; inch <= maxInches + 0.001; inch += inchMinorStep) {
    const rounded = Math.round(inch * 10) / 10;
    const x = rulerX0 + rounded * 25.4 * pxPerMm;
    if (x > rulerX0 + rulerW + 0.5) break;
    const isMajor = Math.abs(rounded % inchMajorStep) < 0.01;
    imperialTicks.push({ inch: rounded, x, isMajor });
  }

  // Right-side silhouette comparison geometry
  const silBoxX = 472;
  const silBoxW = W - silBoxX - 12;
  const silTopY = 22;
  const silBotY = 104;
  const silSpanPx = silBotY - silTopY;

  const isHand = scaleRef.silhouetteKind === 'hand';
  const isArcher = scaleRef.silhouetteKind === 'archer';
  const maxRefMm = Math.max(scaleRef.referenceLengthMm, scaleRef.oalMm * 1.05);
  const refBarH = (scaleRef.referenceLengthMm / maxRefMm) * silSpanPx;
  const weaponBarH = Math.max(
    8,
    (scaleRef.oalMm / maxRefMm) * silSpanPx
  );

  const oalIn = (scaleRef.oalMm / 25.4).toFixed(1);
  const barrelIn = (scaleRef.barrelMm / 25.4).toFixed(1);
  const weightLb = (scaleRef.weightKg * 2.20462).toFixed(1);

  const barrelLabel = isArchery
    ? isZh
      ? '做功行程'
      : 'POWER STROKE'
    : isZh
      ? '枪管长'
      : 'BARREL';

  const silHeader = isHand
    ? isZh
      ? '人手实尺比对 (190 mm)'
      : 'HAND SCALE (190 mm)'
    : isArcher
      ? isZh
        ? '射手身高比对 (175 cm)'
        : 'ARCHER SCALE (175 cm)'
      : isZh
        ? '成人身高比对 (175 cm)'
        : 'HUMAN SCALE (175 cm)';

  return (
    <svg
      className={`dk-true-scale-ruler ${className}`.trim()}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={scaleRef.caption}
      style={{
        width: '100%',
        height: 'auto',
        display: 'block',
        fontFamily: SANS_FONT,
      }}
    >
      {/* Crisp white archival museum border */}
      <rect
        x={0.5}
        y={0.5}
        width={W - 1}
        height={H - 1}
        fill={DK_PALETTE.paper}
        stroke={DK_PALETTE.rule}
        strokeWidth={0.9}
      />

      {/* Top left scale kicker */}
      <text
        x={rulerX0}
        y={15}
        fontSize={7.8}
        fontWeight={800}
        fill={DK_PALETTE.ink}
        letterSpacing="0.06em"
      >
        {isZh
          ? `1:1 公英制实尺标尺${exhibitLabel ? ` · ${exhibitLabel}` : ''}`
          : `METRIC / IMPERIAL SCALE BAR${exhibitLabel ? ` · ${exhibitLabel}` : ''}`}
      </text>
      <text
        x={rulerX0 + rulerW}
        y={15}
        textAnchor="end"
        fontSize={7.5}
        fontWeight={700}
        fontFamily={MONO_FONT}
        fill={DK_PALETTE.muted}
      >
        {scaleRef.weightKg.toFixed(2)} kg ({weightLb} lb)
      </text>

      {/* Metric Ruler Axis (cm) */}
      <line
        x1={rulerX0}
        y1={metricY}
        x2={rulerX0 + rulerW}
        y2={metricY}
        stroke={DK_PALETTE.ink}
        strokeWidth={0.9}
      />
      <text
        x={rulerX0 - 4}
        y={metricY - 10}
        textAnchor="end"
        fontSize={7}
        fontWeight={800}
        fontFamily={MONO_FONT}
        fill={DK_PALETTE.ink}
      >
        cm
      </text>
      {metricTicks.map((t) => (
        <g key={`cm-${t.cm}`}>
          <line
            x1={t.x}
            y1={metricY}
            x2={t.x}
            y2={metricY - (t.isMajor ? 8 : 4.2)}
            stroke={t.isMajor ? DK_PALETTE.ink : DK_PALETTE.muted}
            strokeWidth={t.isMajor ? 0.9 : 0.6}
          />
          {t.isMajor && (
            <text
              x={t.x}
              y={metricY - 10.5}
              textAnchor="middle"
              fontSize={7.2}
              fontWeight={700}
              fontFamily={MONO_FONT}
              fill={DK_PALETTE.ink}
            >
              {t.cm}
            </text>
          )}
        </g>
      ))}

      {/* Weapon OAL Bar + Nested Barrel/Power-Stroke Brass Span */}
      <rect
        x={rulerX0}
        y={barY}
        width={rulerW}
        height={barH}
        fill={DK_PALETTE.paperTint}
        stroke={DK_PALETTE.ruleLight}
        strokeWidth={0.7}
      />
      {/* Overall Length Span */}
      <rect
        x={rulerX0}
        y={barY}
        width={oalBarW}
        height={barH}
        fill={DK_PALETTE.ink}
      />
      {/* Barrel / Power-Stroke Span nested in Archival Brass */}
      <rect
        x={rulerX0 + oalBarW - barrelBarW}
        y={barY + 2}
        width={barrelBarW}
        height={barH - 4}
        fill={DK_PALETTE.brass}
      />
      {/* OAL End-Cap Crimson Marker */}
      <line
        x1={rulerX0 + oalBarW}
        y1={metricY}
        x2={rulerX0 + oalBarW}
        y2={imperialY}
        stroke={DK_PALETTE.crimson}
        strokeWidth={1.15}
        strokeDasharray="2.5 1.5"
      />
      <circle
        cx={rulerX0 + oalBarW}
        cy={barY + barH * 0.5}
        r={3}
        fill={DK_PALETTE.crimson}
        stroke={DK_PALETTE.paper}
        strokeWidth={1}
      />

      {/* Inline Bar Legend Readouts */}
      <text
        x={rulerX0 + 5}
        y={barY + 10}
        fontSize={7.2}
        fontWeight={800}
        fontFamily={MONO_FONT}
        fill={DK_PALETTE.paper}
      >
        OAL {Math.round(scaleRef.oalMm)} mm ({oalIn}&quot;)
      </text>
      {barrelBarW >= 88 && (
        <text
          x={rulerX0 + oalBarW - 6}
          y={barY + 10}
          textAnchor="end"
          fontSize={6.8}
          fontWeight={800}
          fontFamily={MONO_FONT}
          fill={DK_PALETTE.paper}
        >
          {barrelLabel} {Math.round(scaleRef.barrelMm)} mm ({barrelIn}&quot;)
        </text>
      )}

      {/* Imperial Ruler Axis (inches) */}
      <line
        x1={rulerX0}
        y1={imperialY}
        x2={rulerX0 + rulerW}
        y2={imperialY}
        stroke={DK_PALETTE.muted}
        strokeWidth={0.85}
      />
      <text
        x={rulerX0 - 4}
        y={imperialY + 15}
        textAnchor="end"
        fontSize={7}
        fontWeight={800}
        fontFamily={MONO_FONT}
        fill={DK_PALETTE.muted}
      >
        in
      </text>
      {imperialTicks.map((t) => (
        <g key={`in-${t.inch}`}>
          <line
            x1={t.x}
            y1={imperialY}
            x2={t.x}
            y2={imperialY + (t.isMajor ? 7.5 : 4)}
            stroke={t.isMajor ? DK_PALETTE.inkSecondary : DK_PALETTE.rule}
            strokeWidth={t.isMajor ? 0.85 : 0.6}
          />
          {t.isMajor && (
            <text
              x={t.x}
              y={imperialY + 16}
              textAnchor="middle"
              fontSize={7}
              fontWeight={700}
              fontFamily={MONO_FONT}
              fill={DK_PALETTE.muted}
            >
              {t.inch}&quot;
            </text>
          )}
        </g>
      ))}

      {/* Bottom Bilingual Scale Caption */}
      <text
        x={rulerX0}
        y={H - 10}
        fontSize={8.2}
        fontWeight={700}
        fill={DK_PALETTE.ink}
      >
        {scaleRef.caption}
      </text>
      {barrelBarW < 88 && (
        <text
          x={rulerX0 + rulerW}
          y={H - 10}
          textAnchor="end"
          fontSize={7.4}
          fontWeight={700}
          fontFamily={MONO_FONT}
          fill={DK_PALETTE.brass}
        >
          {barrelLabel}: {Math.round(scaleRef.barrelMm)} mm ({barrelIn}&quot;)
        </text>
      )}

      {/* Vertical Divider */}
      <line
        x1={silBoxX - 10}
        y1={10}
        x2={silBoxX - 10}
        y2={H - 10}
        stroke={DK_PALETTE.rule}
        strokeWidth={0.8}
      />

      {/* Right Zone: Minimalist Vector Hand / Adult / Archer Silhouette */}
      <text
        x={silBoxX + silBoxW * 0.5}
        y={15}
        textAnchor="middle"
        fontSize={7.3}
        fontWeight={800}
        fill={DK_PALETTE.ink}
        letterSpacing="0.04em"
      >
        {silHeader}
      </text>

      {/* Ground datum line */}
      <line
        x1={silBoxX + 10}
        y1={silBotY}
        x2={silBoxX + silBoxW - 10}
        y2={silBotY}
        stroke={DK_PALETTE.ink}
        strokeWidth={0.85}
      />

      {/* Minimalist Architectural Silhouette scaled cleanly to refBarH */}
      {isHand ? (
        // Minimalist Open Adult Hand Silhouette (190mm vertical span)
        <g
          transform={`translate(${silBoxX + 34}, ${silBotY - refBarH}) scale(${refBarH / 100})`}
        >
          <path
            d="M 18 100 L 18 68 L 8 53 C 6 49 9 45 13 48 L 21 56 L 21 16 C 21 12 27 12 27 16 L 27 46 L 31 46 L 31 6 C 31 2 37 2 37 6 L 37 45 L 41 45 L 41 11 C 41 7 47 7 47 11 L 47 47 L 51 47 L 51 22 C 51 18 57 18 57 22 L 57 67 C 57 82 50 93 48 100 Z"
            fill="#E2E8F0"
            stroke={DK_PALETTE.muted}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        </g>
      ) : (
        // Minimalist Standing Adult / Archer Silhouette (1750mm vertical span)
        <g
          transform={`translate(${silBoxX + 38}, ${silBotY - refBarH}) scale(${refBarH / 100})`}
        >
          {/* Head */}
          <circle
            cx={22}
            cy={8.5}
            r={6.8}
            fill="#CBD5E1"
            stroke={DK_PALETTE.muted}
            strokeWidth={1.2}
          />
          {/* Torso, Arms & Legs */}
          <path
            d={
              isArcher
                ? 'M 15 18 L 29 18 L 44 26 L 44 31 L 30 25 L 29 52 L 32 98 L 26 98 L 22 62 L 18 98 L 12 98 L 15 52 L 12 31 L 4 27 L 5 22 Z'
                : 'M 14 18 L 30 18 C 34 18 36 22 36 26 L 37 54 L 32 54 L 31 30 L 29 52 L 31 98 L 25 98 L 22 61 L 19 98 L 13 98 L 15 52 L 13 30 L 12 54 L 7 54 L 8 26 C 8 22 10 18 14 18 Z'
            }
            fill="#E2E8F0"
            stroke={DK_PALETTE.muted}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          {/* Subtle vertical bow arc for archer silhouette */}
          {isArcher && (
            <path
              d="M 46 8 Q 52 28 46 49 L 46 8 Z"
              fill="none"
              stroke={DK_PALETTE.brass}
              strokeWidth={1.6}
            />
          )}
        </g>
      )}

      {/* Comparative Crimson Scale Column beside Silhouette */}
      <g>
        <line
          x1={silBoxX + 106}
          y1={silBotY - weaponBarH}
          x2={silBoxX + 106}
          y2={silBotY}
          stroke={DK_PALETTE.crimson}
          strokeWidth={4}
        />
        <line
          x1={silBoxX + 100}
          y1={silBotY - weaponBarH}
          x2={silBoxX + 112}
          y2={silBotY - weaponBarH}
          stroke={DK_PALETTE.crimson}
          strokeWidth={1.2}
        />
        <line
          x1={silBoxX + 100}
          y1={silBotY}
          x2={silBoxX + 112}
          y2={silBotY}
          stroke={DK_PALETTE.crimson}
          strokeWidth={1.2}
        />
        <text
          x={silBoxX + 120}
          y={silBotY - weaponBarH * 0.5 - 2}
          fontSize={12.5}
          fontWeight={900}
          fontFamily={MONO_FONT}
          fill={DK_PALETTE.crimson}
        >
          {scaleRef.ratioPercent}%
        </text>
        <text
          x={silBoxX + 120}
          y={silBotY - weaponBarH * 0.5 + 10}
          fontSize={7.2}
          fontWeight={700}
          fontFamily={MONO_FONT}
          fill={DK_PALETTE.inkSecondary}
        >
          {Math.round(scaleRef.oalMm)} mm
        </text>
      </g>

      {/* Bottom Right Reference Footer */}
      <text
        x={silBoxX + silBoxW * 0.5}
        y={H - 10}
        textAnchor="middle"
        fontSize={6.8}
        fontWeight={700}
        fontFamily={MONO_FONT}
        fill={DK_PALETTE.muted}
      >
        {isHand ? 'REF: 190 mm PALM' : 'REF: 1,750 mm (5\'9")'}
      </text>
    </svg>
  );
};

// ----------------------------------------------------------------------------
// 4. DkActualSizeCartridgePlate — True Physical 1:1 mm CSS-Unit Cutaway SVG
// ----------------------------------------------------------------------------

export interface DkActualSizeCartridgePlateProps {
  cartridgeSpec: CartridgeLabSpec;
  lang: LanguageCode;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

export const DkActualSizeCartridgePlate: React.FC<
  DkActualSizeCartridgePlateProps
> = ({ cartridgeSpec, lang, orientation = 'vertical', className = '' }) => {
  const uid = useId();
  const brassHatchId = `${uid}-brass-hatch`;
  const hullHatchId = `${uid}-hull-hatch`;
  const carbonHatchId = `${uid}-carbon-hatch`;
  const powderId = `${uid}-powder`;

  const isZh = lang === 'zh';
  const layout = computeDkCartridgePlateLayout(cartridgeSpec, lang, orientation);
  const caliberKey = String(cartridgeSpec.caliber);
  const archeryMeta = layout.isArchery
    ? getArcheryProjectileMeta(caliberKey)
    : null;

  // Coordinate space: 1 SVG user unit === 1 physical millimeter (mm)
  // Both vertical & horizontal orientations keep dimension labels upright!
  const renderArcherySvg = () => {
    const isHorizontal = orientation === 'horizontal';
    const W = layout.svgWidthMm;
    const H = layout.svgHeightMm;
    const s = 1 / layout.scaleDenom;
    const totalLen = layout.oalMm * s;

    const broadheadLen = Math.max(8, 28 * s);
    const broadheadHalfW = Math.max(2.6, (archeryMeta?.broadheadDiameterMm ?? 28) * 0.5 * s);
    const shaftHalfW = Math.max(1.25, (archeryMeta?.shaftDiameterMm ?? 6) * 0.5 * s);
    const wallW = Math.max(0.42, shaftHalfW * 0.38);
    const insertLen = Math.max(3.5, 18 * s);
    const vaneH = Math.max(10, 56 * s);
    const vaneHalfW = Math.max(3.2, shaftHalfW * 2.6);
    const nockH = Math.max(2.8, 12 * s);

    // Canonical vertical arrow frame: base (nock) at y=0, broadhead tip at y=-totalLen
    const tipY = -totalLen;
    const yBroadheadBase = tipY + broadheadLen;
    const yInsertEnd = yBroadheadBase + insertLen;
    const yVaneBot = -nockH - 3;
    const yVaneTop = yVaneBot - vaneH;

    const originX = isHorizontal ? 10 : W * 0.36;
    const originY = isHorizontal ? H * 0.48 : H - 8;
    const groupTransform = isHorizontal
      ? `translate(${originX.toFixed(2)}, ${originY.toFixed(2)}) rotate(90)`
      : `translate(${originX.toFixed(2)}, ${originY.toFixed(2)})`;

    return (
      <svg
        className="dk-actual-size-cartridge-svg"
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: `${W}mm`,
          height: `${H}mm`,
          display: 'block',
          overflow: 'visible',
          fontFamily: MONO_FONT,
        }}
        role="img"
        aria-label={
          isZh
            ? `${cartridgeSpec.nameZh} ${layout.scaleStamp}`
            : `${cartridgeSpec.nameEn} ${layout.scaleStamp}`
        }
      >
        <defs>
          <pattern
            id={carbonHatchId}
            width={1.6}
            height={1.6}
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <rect width={1.6} height={1.6} fill="#334155" fillOpacity={0.28} />
            <line x1={0} y1={0} x2={0} y2={1.6} stroke={DK_PALETTE.ink} strokeWidth={0.35} />
          </pattern>
        </defs>

        <g transform={groupTransform}>
          {/* Center datum axis */}
          <line
            x1={0}
            y1={tipY - 3}
            x2={0}
            y2={3}
            stroke={DK_PALETTE.muted}
            strokeWidth={0.22}
            strokeDasharray="1.8 1 0.5 1"
          />

          {/* 3-Blade Broadhead (Left solid stainless / Right 45° section) */}
          <polygon
            points={`0,${tipY} ${-broadheadHalfW},${yBroadheadBase} ${-shaftHalfW},${yBroadheadBase} 0,${yBroadheadBase}`}
            fill="#94A3B8"
            stroke={DK_PALETTE.ink}
            strokeWidth={0.28}
          />
          <polygon
            points={`0,${tipY} ${broadheadHalfW},${yBroadheadBase} ${shaftHalfW},${yBroadheadBase} 0,${yBroadheadBase}`}
            fill={`url(#${carbonHatchId})`}
            stroke={DK_PALETTE.ink}
            strokeWidth={0.28}
          />

          {/* Brass / Alloy Threaded Insert */}
          <rect
            x={-shaftHalfW}
            y={yBroadheadBase}
            width={shaftHalfW * 2}
            height={insertLen}
            fill={DK_PALETTE.brass}
            stroke={DK_PALETTE.ink}
            strokeWidth={0.24}
          />

          {/* Carbon Shaft Left Exterior & Right Hollow Wall Cutaway */}
          <rect
            x={-shaftHalfW}
            y={yInsertEnd}
            width={shaftHalfW}
            height={Math.max(4, -nockH - yInsertEnd)}
            fill={DK_PALETTE.ink}
            stroke={DK_PALETTE.ink}
            strokeWidth={0.24}
          />
          <rect
            x={0}
            y={yInsertEnd}
            width={shaftHalfW}
            height={Math.max(4, -nockH - yInsertEnd)}
            fill={DK_PALETTE.paperTint}
            stroke={DK_PALETTE.ink}
            strokeWidth={0.22}
          />
          <rect
            x={shaftHalfW - wallW}
            y={yInsertEnd}
            width={wallW}
            height={Math.max(4, -nockH - yInsertEnd)}
            fill={`url(#${carbonHatchId})`}
          />

          {/* Helical Polymer Vanes */}
          <polygon
            points={`${-shaftHalfW},${yVaneTop} ${-vaneHalfW},${yVaneTop + vaneH * 0.25} ${-vaneHalfW},${yVaneBot} ${-shaftHalfW},${yVaneBot}`}
            fill={DK_PALETTE.crimson}
            fillOpacity={0.82}
            stroke={DK_PALETTE.ink}
            strokeWidth={0.22}
          />
          <polygon
            points={`${shaftHalfW},${yVaneTop} ${vaneHalfW},${yVaneTop + vaneH * 0.25} ${vaneHalfW},${yVaneBot} ${shaftHalfW},${yVaneBot}`}
            fill={DK_PALETTE.brass}
            fillOpacity={0.85}
            stroke={DK_PALETTE.ink}
            strokeWidth={0.22}
          />

          {/* Nock */}
          <rect
            x={-shaftHalfW}
            y={-nockH}
            width={shaftHalfW * 2}
            height={nockH}
            fill={DK_PALETTE.crimson}
            stroke={DK_PALETTE.ink}
            strokeWidth={0.24}
          />
        </g>

        {/* Upright Dimension Callouts */}
        {!isHorizontal ? (
          (() => {
            const topY = originY + tipY;
            const botY = originY;
            const dimX = originX + broadheadHalfW + 6;
            return (
              <g>
                <line x1={originX + 1} y1={topY} x2={dimX + 2} y2={topY} stroke={DK_PALETTE.crimson} strokeWidth={0.24} />
                <line x1={originX + shaftHalfW + 1} y1={botY} x2={dimX + 2} y2={botY} stroke={DK_PALETTE.crimson} strokeWidth={0.24} />
                <line x1={dimX} y1={topY} x2={dimX} y2={botY} stroke={DK_PALETTE.crimson} strokeWidth={0.32} />
                <polygon points={`${dimX},${topY} ${dimX - 0.8},${topY + 2} ${dimX + 0.8},${topY + 2}`} fill={DK_PALETTE.crimson} />
                <polygon points={`${dimX},${botY} ${dimX - 0.8},${botY - 2} ${dimX + 0.8},${botY - 2}`} fill={DK_PALETTE.crimson} />

                <text x={dimX + 2.2} y={(topY + botY) * 0.5 - 1.8} fontSize={2.7} fontWeight={800} fill={DK_PALETTE.crimson}>
                  OAL
                </text>
                <text x={dimX + 2.2} y={(topY + botY) * 0.5 + 1.8} fontSize={3.1} fontWeight={800} fill={DK_PALETTE.ink}>
                  {layout.oalMm.toFixed(1)} mm
                </text>
                <text x={dimX + 2.2} y={originY + yBroadheadBase + 2} fontSize={2.4} fontWeight={700} fill={DK_PALETTE.inkSecondary}>
                  {isZh ? '三刃猎箭头' : 'Broadhead'}
                </text>
                <text x={dimX + 2.2} y={originY + (yInsertEnd + yVaneTop) * 0.5} fontSize={2.4} fontWeight={700} fill={DK_PALETTE.inkSecondary}>
                  Ø{layout.bulletDiameterMm.toFixed(1)} mm
                </text>
                <text x={dimX + 2.2} y={botY - 1} fontSize={2.4} fontWeight={700} fill={DK_PALETTE.muted}>
                  {isZh ? '尾扣' : 'Nock'}
                </text>
              </g>
            );
          })()
        ) : (
          (() => {
            const xLeft = originX;
            const xRight = originX + totalLen;
            const yDim = originY + Math.max(broadheadHalfW, vaneHalfW) + 5;
            return (
              <g>
                <line x1={xLeft} y1={originY + shaftHalfW + 1} x2={xLeft} y2={yDim + 1.5} stroke={DK_PALETTE.crimson} strokeWidth={0.24} />
                <line x1={xRight} y1={originY + 1} x2={xRight} y2={yDim + 1.5} stroke={DK_PALETTE.crimson} strokeWidth={0.24} />
                <line x1={xLeft} y1={yDim} x2={xRight} y2={yDim} stroke={DK_PALETTE.crimson} strokeWidth={0.32} />
                <polygon points={`${xLeft},${yDim} ${xLeft + 2},${yDim - 0.8} ${xLeft + 2},${yDim + 0.8}`} fill={DK_PALETTE.crimson} />
                <polygon points={`${xRight},${yDim} ${xRight - 2},${yDim - 0.8} ${xRight - 2},${yDim + 0.8}`} fill={DK_PALETTE.crimson} />
                <text x={(xLeft + xRight) * 0.5} y={yDim + 3.8} textAnchor="middle" fontSize={2.9} fontWeight={800} fill={DK_PALETTE.ink}>
                  OAL {layout.oalMm.toFixed(1)} mm · Ø{layout.bulletDiameterMm.toFixed(1)} mm ({layout.scaleStamp})
                </text>
              </g>
            );
          })()
        )}
      </svg>
    );
  };

  const renderMetallicCartridgeSvg = () => {
    const isHorizontal = orientation === 'horizontal';
    const W = layout.svgWidthMm;
    const H = layout.svgHeightMm;

    // Work in a canonical vertical coordinate frame where base is y=0 and tip is y=-oalMm,
    // centered at x=0, in EXACT 1:1 millimeters (1 unit = 1 mm)!
    const oal = layout.oalMm;
    const caseLen = Math.min(oal * 0.99, layout.caseLengthMm);
    const rRim = (cartridgeSpec.rimDiameterMm || layout.maxDiameterMm) * 0.5;
    const rBase = (cartridgeSpec.baseDiameterMm || layout.maxDiameterMm) * 0.5;
    const rNeck = (cartridgeSpec.neckDiameterMm || layout.bulletDiameterMm) * 0.5;
    const rShoulder = ((cartridgeSpec.shoulderDiameterMm ?? cartridgeSpec.neckDiameterMm) || rNeck * 2) * 0.5;
    const rBullet = layout.bulletDiameterMm * 0.5;
    const rimThk = Math.max(0.9, cartridgeSpec.rimThicknessMm || 1.25);

    const is12Ga = caliberKey === '12_gauge';
    const isRimmed =
      caliberKey === '357_magnum' ||
      rRim > rBase * 1.08;
    const isBottleneck =
      cartridgeSpec.shoulderDiameterMm !== null &&
      cartridgeSpec.shoulderDiameterMm > cartridgeSpec.neckDiameterMm * 1.06;

    const grooveTop = rimThk * 2.15;
    const rGroove = rBase * 0.85;
    const shoulderY = isBottleneck ? -caseLen * 0.74 : -caseLen * 0.94;
    const neckStartY = isBottleneck ? -caseLen * 0.86 : -caseLen;
    const wallThk = Math.max(0.65, rNeck * 0.17);
    const webH = Math.max(2.2, caseLen * 0.11);
    const primerR = Math.min(rBase * 0.36, 3.0);
    const primerH = Math.min(webH * 0.78, 2.8);
    const bulletSeat = Math.min(rBullet * 1.3, caseLen * 0.2);
    const bulletBaseY = -caseLen + bulletSeat;
    const cavityH = Math.max(2.5, Math.abs(bulletBaseY) - webH);
    const fillRatio = Math.max(0.2, Math.min(0.95, cartridgeSpec.propellantFillRatio || 0.75));
    const powderTopY = -webH - cavityH * fillRatio;

    // Positioning of the 1:1 cartridge group inside the physical mm SVG canvas
    const originX = isHorizontal ? 10 : W * 0.44;
    const originY = isHorizontal ? H * 0.52 : H - 8.5;
    // In horizontal mode, rotate +90deg so base is at originX (left) and tip points right (+X = oal mm)!
    const groupTransform = isHorizontal
      ? `translate(${originX.toFixed(2)}, ${originY.toFixed(2)}) rotate(90)`
      : `translate(${originX.toFixed(2)}, ${originY.toFixed(2)})`;

    const buildBodyPaths = () => {
      if (is12Ga) {
        const brassH = oal * 0.27;
        const hullWall = Math.max(0.95, rBase * 0.12);
        const rInner = Math.max(3.5, rBase - hullWall);
        const baseWadH = oal * 0.095;
        const powderH = oal * 0.16;
        const yPowderBot = -baseWadH;
        const yPowderTop = yPowderBot - powderH;
        const wadSkirtH = oal * 0.11;
        const yWadCupBot = yPowderTop - wadSkirtH;
        const yCrimp = -oal + 2.2;
        const pelletR = Math.min((rInner - 0.8) * 0.44, 3.6);
        const tierSpan = Math.max(pelletR * 2.04, (Math.abs(yCrimp - yWadCupBot) - pelletR * 2.3) * 0.44);
        const tierBase = yWadCupBot - pelletR - 0.8;

        const pellets = [
          { x: -pelletR * 0.88, y: tierBase },
          { x: pelletR * 0.9, y: tierBase },
          { x: 0.3, y: tierBase - pelletR * 0.32 },
          { x: -pelletR * 0.86, y: tierBase - tierSpan },
          { x: pelletR * 0.88, y: tierBase - tierSpan },
          { x: 0.25, y: tierBase - tierSpan - pelletR * 0.3 },
          { x: -pelletR * 0.86, y: tierBase - tierSpan * 2 },
          { x: pelletR * 0.86, y: tierBase - tierSpan * 2 },
          { x: 0.25, y: tierBase - tierSpan * 2 - pelletR * 0.3 },
        ];

        return (
          <g>
            {/* Right Interior Cavity + Flake Powder */}
            <rect x={0} y={yCrimp} width={rInner} height={Math.abs(yCrimp - yPowderBot)} fill={DK_PALETTE.paperTint} />
            <rect x={0} y={yPowderTop} width={rInner} height={powderH} fill={`url(#${powderId})`} />

            {/* Polyethylene Shot-Cup H-Wad */}
            <rect x={0} y={yPowderTop - 1.2} width={rInner} height={1.2} fill="#E2E8F0" stroke={DK_PALETTE.muted} strokeWidth={0.22} />
            <line x1={rInner * 0.35} y1={yPowderTop - 1.2} x2={rInner * 0.68} y2={yWadCupBot + 1} stroke="#CBD5E1" strokeWidth={0.8} />
            <line x1={rInner * 0.72} y1={yPowderTop - 1.2} x2={rInner * 0.35} y2={yWadCupBot + 1} stroke="#CBD5E1" strokeWidth={0.8} />
            <path
              d={`M 0 ${yWadCupBot + 1} L ${rInner} ${yWadCupBot + 1} L ${rInner} ${yCrimp + 0.8} L ${rInner - 0.85} ${yCrimp + 0.8} L ${rInner - 0.85} ${yWadCupBot} L 0 ${yWadCupBot} Z`}
              fill="#E2E8F0"
              stroke={DK_PALETTE.muted}
              strokeWidth={0.22}
            />

            {/* 9× 00 Lead Buckshot Spheres */}
            {pellets.map((p, idx) => (
              <circle
                key={idx}
                cx={p.x}
                cy={p.y}
                r={pelletR}
                fill="#64748B"
                stroke={DK_PALETTE.ink}
                strokeWidth={0.24}
              />
            ))}

            {/* Left Exterior: Crimson Hull + High Brass Cup */}
            <path
              d={`M 0 ${-brassH} L ${-rBase} ${-brassH} L ${-rBase} ${yCrimp} Q ${-rBase} ${-oal} ${-rBase + 2} ${-oal} L 0 ${-oal} Z`}
              fill={DK_PALETTE.crimson}
              stroke="#7F1D1D"
              strokeWidth={0.28}
            />
            <path
              d={`M 0 0 L ${-rRim} 0 L ${-rRim} ${-rimThk} L ${-rBase - 0.35} ${-rimThk - 0.3} L ${-rBase - 0.35} ${-brassH} L 0 ${-brassH} Z`}
              fill="#D4A438"
              stroke="#78350F"
              strokeWidth={0.28}
            />

            {/* Right Cutaway: Crimson Hull Wall + High Brass Wall + 209 Primer */}
            <path
              d={`M ${rBase} ${-brassH} L ${rBase} ${yCrimp} Q ${rBase} ${-oal} ${rBase - 2} ${-oal} L 0.6 ${-oal} L 0.6 ${yCrimp} L ${rInner} ${yCrimp} L ${rInner} ${-brassH} Z`}
              fill={`url(#${hullHatchId})`}
              stroke="#991B1B"
              strokeWidth={0.26}
            />
            <path
              d={`M ${primerR} 0 L ${rRim} 0 L ${rRim} ${-rimThk} L ${rBase + 0.35} ${-rimThk - 0.3} L ${rBase + 0.35} ${-brassH} L ${rInner} ${-brassH} L ${rInner} ${yPowderBot} L ${primerR} ${yPowderBot} Z`}
              fill={`url(#${brassHatchId})`}
              stroke="#92400E"
              strokeWidth={0.26}
            />
            {/* 209 Primer Cup + Integral Anvil */}
            <rect x={0} y={-primerH * 1.4} width={primerR} height={primerH * 1.4} fill="#CBD5E1" stroke={DK_PALETTE.ink} strokeWidth={0.24} />
            <polygon points={`0,${-primerH * 0.4} ${primerR * 0.65},${-primerH * 1.1} 0,${-primerH * 1.1}`} fill={DK_PALETTE.brass} />
          </g>
        );
      }

      const leftCaseD = isRimmed
        ? `M 0 0 L ${-rRim} 0 L ${-rRim} ${-rimThk} L ${-rBase} ${-rimThk} L ${-rNeck} ${-caseLen} L 0 ${-caseLen} Z`
        : `M 0 0 L ${-rRim} 0 L ${-rRim} ${-rimThk} L ${-rGroove} ${-rimThk - 0.45} L ${-rGroove} ${-grooveTop} L ${-rBase} ${-grooveTop - 0.6} L ${-rShoulder} ${shoulderY} L ${-rNeck} ${neckStartY} L ${-rNeck} ${-caseLen} L 0 ${-caseLen} Z`;

      const rightCaseWallD = isRimmed
        ? `M 0 0 L ${rRim} 0 L ${rRim} ${-rimThk} L ${rBase} ${-rimThk} L ${rNeck} ${-caseLen} L ${Math.max(0.6, rNeck - wallThk)} ${-caseLen} L ${Math.max(0.8, rBase - wallThk * 1.25)} ${-webH} L 0.55 ${-webH} L 0.55 ${-primerH} L ${primerR} ${-primerH} L ${primerR} 0 Z`
        : `M 0 0 L ${rRim} 0 L ${rRim} ${-rimThk} L ${rGroove} ${-rimThk - 0.45} L ${rGroove} ${-grooveTop} L ${rBase} ${-grooveTop - 0.6} L ${rShoulder} ${shoulderY} L ${rNeck} ${neckStartY} L ${rNeck} ${-caseLen} L ${Math.max(0.6, rNeck - wallThk)} ${-caseLen} L ${Math.max(0.6, rNeck - wallThk)} ${neckStartY} L ${Math.max(0.8, rShoulder - wallThk * 1.15)} ${shoulderY} L ${Math.max(1.0, rBase - wallThk * 1.4)} ${-webH} L 0.55 ${-webH} L 0.55 ${-primerH} L ${primerR} ${-primerH} L ${primerR} 0 Z`;

      const isRoundNose = caliberKey === '9mm_para' || caliberKey === '45_acp';
      const isJhp = cartridgeSpec.coreKind === 'jhp_cavity';
      const isJsp = cartridgeSpec.coreKind === 'jsp_soft_point';
      const hasDualCore =
        cartridgeSpec.coreKind === 'dual_core_penetrator' ||
        cartridgeSpec.coreKind === 'ap_steel_alu' ||
        cartridgeSpec.coreKind === 'steel_core_lead_shirt' ||
        cartridgeSpec.coreKind === 'm33_heavy_steel';

      const noseLen = Math.max(3, oal - caseLen);
      const jhpFlatR = rBullet * 0.42;

      const leftBulletD = isJhp
        ? `M 0 ${-caseLen} L ${-rBullet} ${-caseLen} Q ${-rBullet} ${-oal + noseLen * 0.45} ${-jhpFlatR} ${-oal} L 0 ${-oal} Z`
        : isRoundNose
          ? `M 0 ${-caseLen} L ${-rBullet} ${-caseLen} C ${-rBullet} ${-oal + noseLen * 0.18} ${-rBullet * 0.58} ${-oal} 0 ${-oal} Z`
          : `M 0 ${-caseLen} L ${-rBullet} ${-caseLen} Q ${-rBullet} ${-oal + noseLen * 0.45} 0 ${-oal} Z`;

      const rightBulletJacketD = isJhp
        ? `M 0 ${bulletBaseY} L ${rBullet} ${bulletBaseY} L ${rBullet} ${-caseLen} Q ${rBullet} ${-oal + noseLen * 0.45} ${jhpFlatR} ${-oal} L 0 ${-oal} Z`
        : isRoundNose
          ? `M 0 ${bulletBaseY} L ${rBullet} ${bulletBaseY} L ${rBullet} ${-caseLen} C ${rBullet} ${-oal + noseLen * 0.18} ${rBullet * 0.58} ${-oal} 0 ${-oal} Z`
          : `M 0 ${bulletBaseY} L ${rBullet} ${bulletBaseY} L ${rBullet} ${-caseLen} Q ${rBullet} ${-oal + noseLen * 0.45} 0 ${-oal} Z`;

      const rCore = Math.max(0.8, rBullet - Math.max(0.55, rBullet * 0.18));
      const coreTipY = isJsp ? -oal : -oal + noseLen * 0.14;
      const rightCoreD = isJhp
        ? `M 0 ${bulletBaseY - 0.5} L ${rCore} ${bulletBaseY - 0.5} L ${rCore} ${-caseLen} L ${jhpFlatR * 0.72} ${-oal + noseLen * 0.25} L 0 ${-oal + noseLen * 0.25} Z`
        : `M 0 ${bulletBaseY - 0.5} L ${rCore} ${bulletBaseY - 0.5} L ${rCore} ${-caseLen} Q ${rCore} ${coreTipY + noseLen * 0.36} 0 ${coreTipY} Z`;

      const splitY = -caseLen - noseLen * 0.24;

      return (
        <g>
          {/* Right Cutaway Cavity Backdrop & Smokeless Propellant Granules */}
          <rect
            x={0}
            y={-caseLen}
            width={Math.max(1, rShoulder - wallThk * 1.15)}
            height={Math.max(1, caseLen - webH)}
            fill={DK_PALETTE.paperTint}
          />
          <rect
            x={0}
            y={powderTopY}
            width={Math.max(1, rShoulder - wallThk * 1.15)}
            height={Math.max(1, -webH - powderTopY)}
            fill={`url(#${powderId})`}
          />

          {/* Left Solid Brass Case & Copper Jacket Exterior */}
          <path
            d={leftCaseD}
            fill={cartridgeSpec.caseColor || '#D4A438'}
            stroke="#78350F"
            strokeWidth={0.26}
          />
          <path
            d={leftBulletD}
            fill={cartridgeSpec.jacketColor || '#C2511A'}
            stroke="#7C2D12"
            strokeWidth={0.26}
          />

          {/* Right Cutaway 45° Hatched Brass Case Wall */}
          <path
            d={rightCaseWallD}
            fill={`url(#${brassHatchId})`}
            stroke="#92400E"
            strokeWidth={0.26}
          />

          {/* Boxer Primer Pocket, Nickel Cup, Flash Hole & 3-Leg Brass Anvil */}
          <rect
            x={0}
            y={-primerH}
            width={primerR}
            height={primerH}
            fill="#CBD5E1"
            stroke={DK_PALETTE.inkSecondary}
            strokeWidth={0.22}
          />
          <polygon
            points={`0,${-primerH * 0.25} ${primerR * 0.62},${-primerH * 0.85} 0,${-primerH * 0.85}`}
            fill={DK_PALETTE.brass}
          />
          <rect x={0} y={-webH} width={0.55} height={Math.max(0.4, webH - primerH)} fill={DK_PALETTE.ink} />

          {/* Right Cutaway Bullet Jacket & Lead / Hardened Steel Penetrator Core */}
          <path
            d={rightBulletJacketD}
            fill={cartridgeSpec.jacketColor || '#C2511A'}
            stroke="#7C2D12"
            strokeWidth={0.24}
          />
          <path
            d={rightCoreD}
            fill={isJsp ? '#64748B' : '#475569'}
            stroke={DK_PALETTE.ink}
            strokeWidth={0.2}
          />
          {hasDualCore && (
            <path
              d={`M 0 ${splitY} L ${rCore * 0.86} ${splitY} Q ${rCore * 0.72} ${coreTipY + noseLen * 0.25} 0 ${coreTipY} Z`}
              fill="#CBD5E1"
              stroke={DK_PALETTE.ink}
              strokeWidth={0.2}
            />
          )}
          {isJhp && (
            <polygon
              points={`0,${-oal} ${jhpFlatR * 0.72},${-oal} 0,${-oal + noseLen * 0.42}`}
              fill={DK_PALETTE.paper}
              stroke={DK_PALETTE.inkSecondary}
              strokeWidth={0.18}
            />
          )}
        </g>
      );
    };

    // Dimension lines positioned cleanly in physical mm
    const maxR = Math.max(rRim, rBase);
    const dimFontSize = Math.max(2.35, Math.min(3.0, oal * 0.065));
    const microFontSize = Math.max(2.05, Math.min(2.6, oal * 0.055));

    return (
      <svg
        className="dk-actual-size-cartridge-svg"
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: `${W}mm`,
          height: `${H}mm`,
          display: 'block',
          overflow: 'visible',
          fontFamily: MONO_FONT,
        }}
        role="img"
        aria-label={
          isZh
            ? `${cartridgeSpec.nameZh} ${layout.scaleStamp}`
            : `${cartridgeSpec.nameEn} ${layout.scaleStamp}`
        }
      >
        <defs>
          <pattern
            id={brassHatchId}
            width={1.6}
            height={1.6}
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <rect width={1.6} height={1.6} fill={cartridgeSpec.caseColor || '#D4A438'} fillOpacity={0.34} />
            <line x1={0} y1={0} x2={0} y2={1.6} stroke="#92400E" strokeWidth={0.35} />
          </pattern>
          <pattern
            id={hullHatchId}
            width={1.5}
            height={1.5}
            patternTransform="rotate(-45)"
            patternUnits="userSpaceOnUse"
          >
            <rect width={1.5} height={1.5} fill={DK_PALETTE.crimson} fillOpacity={0.32} />
            <line x1={0} y1={0} x2={0} y2={1.5} stroke="#991B1B" strokeWidth={0.34} />
          </pattern>
          <pattern
            id={powderId}
            width={1.5}
            height={1.5}
            patternUnits="userSpaceOnUse"
          >
            <rect width={1.5} height={1.5} fill="#1E293B" />
            <circle cx={0.45} cy={0.45} r={0.28} fill="#64748B" />
            <circle cx={1.15} cy={1.05} r={0.24} fill="#94A3B8" />
          </pattern>
        </defs>

        {/* Cartridge Center Axis + Cutaway Geometry */}
        <g transform={groupTransform}>
          <line
            x1={0}
            y1={-oal - 2.5}
            x2={0}
            y2={2.5}
            stroke={DK_PALETTE.muted}
            strokeWidth={0.2}
            strokeDasharray="1.8 0.9 0.5 0.9"
          />
          {buildBodyPaths()}
        </g>

        {/* Precision Engineering Dimension Arrows (always upright!) */}
        {!isHorizontal ? (
          <g>
            {/* Right Dimension: OAL mm */}
            {(() => {
              const xDim = originX + maxR + 5.2;
              const yTop = originY - oal;
              const yBot = originY;
              return (
                <>
                  <line x1={originX + 1.2} y1={yTop} x2={xDim + 1.5} y2={yTop} stroke={DK_PALETTE.crimson} strokeWidth={0.22} />
                  <line x1={originX + rRim + 1} y1={yBot} x2={xDim + 1.5} y2={yBot} stroke={DK_PALETTE.crimson} strokeWidth={0.22} />
                  <line x1={xDim} y1={yTop} x2={xDim} y2={yBot} stroke={DK_PALETTE.crimson} strokeWidth={0.3} />
                  <polygon points={`${xDim},${yTop} ${xDim - 0.7},${yTop + 1.8} ${xDim + 0.7},${yTop + 1.8}`} fill={DK_PALETTE.crimson} />
                  <polygon points={`${xDim},${yBot} ${xDim - 0.7},${yBot - 1.8} ${xDim + 0.7},${yBot - 1.8}`} fill={DK_PALETTE.crimson} />
                  <text x={xDim + 2} y={(yTop + yBot) * 0.5 - 1.2} fontSize={microFontSize} fontWeight={800} fill={DK_PALETTE.crimson}>
                    OAL
                  </text>
                  <text x={xDim + 2} y={(yTop + yBot) * 0.5 + 1.9} fontSize={dimFontSize} fontWeight={800} fill={DK_PALETTE.ink}>
                    {oal.toFixed(1)} mm
                  </text>
                </>
              );
            })()}

            {/* Left Dimension: Case Length mm */}
            {(() => {
              const xDim = originX - maxR - 4.8;
              const yCase = originY - caseLen;
              const yBot = originY;
              return (
                <>
                  <line x1={xDim - 1.5} y1={yCase} x2={originX - rNeck - 1} y2={yCase} stroke={DK_PALETTE.muted} strokeWidth={0.22} />
                  <line x1={xDim - 1.5} y1={yBot} x2={originX - rRim - 1} y2={yBot} stroke={DK_PALETTE.muted} strokeWidth={0.22} />
                  <line x1={xDim} y1={yCase} x2={xDim} y2={yBot} stroke={DK_PALETTE.muted} strokeWidth={0.26} />
                  <text x={xDim - 1.8} y={(yCase + yBot) * 0.5 - 1.1} textAnchor="end" fontSize={microFontSize} fontWeight={700} fill={DK_PALETTE.muted}>
                    {isZh ? '壳长' : 'CASE'}
                  </text>
                  <text x={xDim - 1.8} y={(yCase + yBot) * 0.5 + 1.8} textAnchor="end" fontSize={dimFontSize * 0.92} fontWeight={800} fill={DK_PALETTE.ink}>
                    {caseLen.toFixed(1)}
                  </text>
                </>
              );
            })()}

            {/* Top Dimension: Bullet Diameter */}
            <text
              x={originX}
              y={Math.max(3.2, originY - oal - 3.6)}
              textAnchor="middle"
              fontSize={microFontSize}
              fontWeight={800}
              fill={DK_PALETTE.brass}
            >
              Ø{layout.bulletDiameterMm.toFixed(2)} mm
            </text>
          </g>
        ) : (
          <g>
            {/* Horizontal OAL Dimension below cartridge */}
            {(() => {
              const xLeft = originX;
              const xRight = originX + oal;
              const yDim = originY + maxR + 5.2;
              return (
                <>
                  <line x1={xLeft} y1={originY + rRim + 0.8} x2={xLeft} y2={yDim + 1.5} stroke={DK_PALETTE.crimson} strokeWidth={0.22} />
                  <line x1={xRight} y1={originY + 0.8} x2={xRight} y2={yDim + 1.5} stroke={DK_PALETTE.crimson} strokeWidth={0.22} />
                  <line x1={xLeft} y1={yDim} x2={xRight} y2={yDim} stroke={DK_PALETTE.crimson} strokeWidth={0.3} />
                  <polygon points={`${xLeft},${yDim} ${xLeft + 1.8},${yDim - 0.7} ${xLeft + 1.8},${yDim + 0.7}`} fill={DK_PALETTE.crimson} />
                  <polygon points={`${xRight},${yDim} ${xRight - 1.8},${yDim - 0.7} ${xRight - 1.8},${yDim + 0.7}`} fill={DK_PALETTE.crimson} />
                  <text x={(xLeft + xRight) * 0.5} y={yDim + 3.6} textAnchor="middle" fontSize={dimFontSize} fontWeight={800} fill={DK_PALETTE.ink}>
                    OAL {oal.toFixed(1)} mm · {isZh ? '壳' : 'CASE'} {caseLen.toFixed(1)} mm
                  </text>
                </>
              );
            })()}
            {/* Top Bullet Diameter Readout */}
            <text
              x={originX + oal * 0.5}
              y={Math.max(4, originY - maxR - 3.5)}
              textAnchor="middle"
              fontSize={microFontSize}
              fontWeight={800}
              fill={DK_PALETTE.brass}
            >
              Ø{layout.bulletDiameterMm.toFixed(2)} mm · {cartridgeSpec.projectileGrain} gr
            </text>
          </g>
        )}
      </svg>
    );
  };

  return (
    <figure
      className={`dk-actual-size-cartridge-plate is-${orientation} ${className}`.trim()}
      data-scale={`1:${layout.scaleDenom}`}
      style={{
        margin: 0,
        padding: '8px 10px',
        backgroundColor: DK_PALETTE.paper,
        border: `0.9px solid ${DK_PALETTE.rule}`,
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: SANS_FONT,
        color: DK_PALETTE.ink,
      }}
    >
      {/* DK Archival 1:1 Actual Size Stamp Header */}
      <div
        className="dk-cartridge-stamp-row"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          borderBottom: `0.75px solid ${DK_PALETTE.rule}`,
          paddingBottom: '5px',
          marginBottom: '6px',
        }}
      >
        <span
          className="dk-actual-size-stamp"
          style={{
            display: 'inline-block',
            padding: '1.5px 6px',
            border: `1.2px solid ${DK_PALETTE.crimson}`,
            color: DK_PALETTE.crimson,
            backgroundColor: DK_PALETTE.crimsonSoft,
            fontFamily: MONO_FONT,
            fontSize: '6.6pt',
            fontWeight: 900,
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
          }}
        >
          {layout.scaleStamp} · {layout.scaleStampSecondary}
        </span>
        <span
          style={{
            fontFamily: MONO_FONT,
            fontSize: '7pt',
            fontWeight: 800,
            color: DK_PALETTE.ink,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {cartridgeSpec.code}
        </span>
      </div>

      {/* Exact CSS Millimeter SVG Cutaway */}
      {layout.isArchery ? renderArcherySvg() : renderMetallicCartridgeSvg()}

      {/* Quantitative Ballistics Micro-Ledger */}
      <figcaption
        className="dk-cartridge-telemetry"
        style={{
          width: '100%',
          marginTop: '6px',
          paddingTop: '5px',
          borderTop: `0.75px solid ${DK_PALETTE.rule}`,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '4px 10px',
          fontFamily: MONO_FONT,
          fontSize: '6.5pt',
          fontWeight: 700,
          color: DK_PALETTE.inkSecondary,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>{cartridgeSpec.projectileGrain} gr ({cartridgeSpec.projectileMassG} g)</span>
        <span>·</span>
        <span>{cartridgeSpec.muzzleVelocityMps} m/s</span>
        <span>·</span>
        <span style={{ color: DK_PALETTE.crimson }}>
          {cartridgeSpec.muzzleEnergyJ.toLocaleString('en-US')} J
        </span>
        {!layout.isArchery && (
          <>
            <span>·</span>
            <span>{cartridgeSpec.peakPressureMPa} MPa</span>
          </>
        )}
      </figcaption>
    </figure>
  );
};

// ----------------------------------------------------------------------------
// 5. DkEvolutionTimelineStrip — 5-Node Horizontal DK Museum Footer Lineage
// ----------------------------------------------------------------------------

export interface DkEvolutionTimelineStripProps {
  nodes: readonly DkTimelineNode[];
  lang: LanguageCode;
  heading?: string;
  className?: string;
}

const ERA_RELATION_LABELS: Readonly<
  Record<DkEraRelation, { zh: string; en: string }>
> = {
  ancestor: { zh: '原理起源', en: 'ANCESTOR' },
  predecessor: { zh: '直系前身', en: 'PREDECESSOR' },
  current: { zh: '本卷展品', en: 'THIS EXHIBIT' },
  rival: { zh: '同期劲敌', en: 'CONTEMPORARY' },
  successor: { zh: '现代演进', en: 'EVOLUTION' },
};

export const DkEvolutionTimelineStrip: React.FC<
  DkEvolutionTimelineStripProps
> = ({ nodes, lang, heading, className = '' }) => {
  if (!nodes || nodes.length === 0) return null;

  const isZh = lang === 'zh';
  const n = nodes.length;
  const resolvedHeading =
    heading ??
    (isZh
      ? '机械演进谱系 · EVOLUTIONARY LINEAGE'
      : 'EVOLUTIONARY LINEAGE · HISTORICAL CONTEXT');

  return (
    <section
      className={`dk-evolution-timeline-strip ${className}`.trim()}
      style={{
        width: '100%',
        borderTop: `1.2px solid ${DK_PALETTE.ink}`,
        paddingTop: '6px',
        fontFamily: SANS_FONT,
        color: DK_PALETTE.ink,
      }}
    >
      {/* Header Kicker */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '4px',
        }}
      >
        <span
          style={{
            fontFamily: MONO_FONT,
            fontSize: '6.8pt',
            fontWeight: 800,
            letterSpacing: '0.09em',
            color: DK_PALETTE.muted,
            textTransform: 'uppercase',
          }}
        >
          {resolvedHeading}
        </span>
        <span
          style={{
            fontFamily: MONO_FONT,
            fontSize: '6.6pt',
            fontWeight: 700,
            color: DK_PALETTE.brass,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {nodes[0].year} — {nodes[n - 1].year}
        </span>
      </div>

      {/* Pure Vector Horizontal Timeline Spine + Aspect-Invariant Era Markers */}
      <div
        className="dk-timeline-axis-track"
        style={{
          position: 'relative',
          width: '100%',
          height: '22px',
          display: 'grid',
          gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
          alignItems: 'center',
        }}
      >
        <svg
          className="dk-timeline-axis-svg"
          viewBox="0 0 1000 28"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            overflow: 'visible',
          }}
        >
          {/* Main horizontal archival hairline */}
          <line
            x1={1000 / (n * 2)}
            y1={14}
            x2={1000 - 1000 / (n * 2)}
            y2={14}
            stroke={DK_PALETTE.ink}
            strokeWidth={0.95}
            vectorEffect="non-scaling-stroke"
          />

          {/* Subtle directional chevrons between adjacent milestones */}
          {nodes.slice(0, -1).map((node, idx) => {
            const x1 = ((idx + 0.5) / n) * 1000;
            const x2 = ((idx + 1.5) / n) * 1000;
            const xm = (x1 + x2) * 0.5;
            return (
              <path
                key={`chev-${node.eraRelation}-${idx}`}
                d={`M ${(xm - 3).toFixed(1)} 10.5 L ${(xm + 2.5).toFixed(1)} 14 L ${(xm - 3).toFixed(1)} 17.5`}
                fill="none"
                stroke={DK_PALETTE.muted}
                strokeWidth={0.9}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        {/* Aspect-Invariant Circular Dots & Highlighted DK Crimson Diamond */}
        {nodes.map((node, idx) => {
          const isRival = node.eraRelation === 'rival';
          return (
            <div
              key={`marker-${node.eraRelation}-${idx}`}
              style={{
                position: 'relative',
                zIndex: 1,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {node.isCurrent ? (
                <svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  style={{ display: 'block' }}
                >
                  <polygon
                    points="12,2 22,12 12,22 2,12"
                    fill={DK_PALETTE.paper}
                    stroke={DK_PALETTE.crimson}
                    strokeWidth={1.3}
                  />
                  <polygon
                    points="12,5.5 18.5,12 12,18.5 5.5,12"
                    fill={DK_PALETTE.crimson}
                  />
                  <circle cx={12} cy={12} r={2} fill={DK_PALETTE.paper} />
                </svg>
              ) : (
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  style={{ display: 'block' }}
                >
                  <circle
                    cx={8}
                    cy={8}
                    r={5.2}
                    fill={DK_PALETTE.paper}
                    stroke={isRival ? DK_PALETTE.brass : DK_PALETTE.ink}
                    strokeWidth={1.3}
                  />
                  <circle
                    cx={8}
                    cy={8}
                    r={2.1}
                    fill={isRival ? DK_PALETTE.brass : DK_PALETTE.ink}
                  />
                </svg>
              )}
            </div>
          );
        })}
      </div>

      {/* Aligned 5-Column Editorial Nodes */}
      <div
        className="dk-timeline-nodes-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
          gap: '8px',
          marginTop: '3px',
        }}
      >
        {nodes.map((node, idx) => {
          const relLabel = ERA_RELATION_LABELS[node.eraRelation][lang];
          return (
            <div
              key={`${node.eraRelation}-${idx}`}
              className={`dk-timeline-node ${node.isCurrent ? 'is-current' : ''}`}
              style={{
                textAlign: 'center',
                padding: node.isCurrent ? '4px 5px' : '4px 3px',
                border: node.isCurrent
                  ? `1px solid ${DK_PALETTE.crimson}`
                  : '1px solid transparent',
                backgroundColor: node.isCurrent
                  ? DK_PALETTE.crimsonSoft
                  : 'transparent',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: '5.8pt',
                  fontWeight: 800,
                  letterSpacing: '0.07em',
                  color: node.isCurrent
                    ? DK_PALETTE.crimson
                    : node.eraRelation === 'rival'
                      ? DK_PALETTE.brass
                      : DK_PALETTE.muted,
                  textTransform: 'uppercase',
                }}
              >
                {relLabel}
              </div>
              <div
                style={{
                  fontFamily: MONO_FONT,
                  fontSize: '8.4pt',
                  fontWeight: 900,
                  color: node.isCurrent ? DK_PALETTE.crimson : DK_PALETTE.ink,
                  fontVariantNumeric: 'tabular-nums',
                  marginTop: '1px',
                }}
              >
                {node.year}
              </div>
              <div
                style={{
                  fontSize: '7.4pt',
                  fontWeight: 800,
                  color: DK_PALETTE.ink,
                  lineHeight: 1.2,
                  marginTop: '1.5px',
                }}
              >
                {node.name}
              </div>
              <div
                style={{
                  fontSize: '6.2pt',
                  color: DK_PALETTE.inkSecondary,
                  lineHeight: 1.25,
                  marginTop: '2px',
                }}
              >
                {node.subtitle}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
