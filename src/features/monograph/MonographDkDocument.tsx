import React, { useMemo } from 'react';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { getExhibitClassification } from '../armory/mechanismShowdownSpecs';
import {
  assembleDkEditorialPack,
  computeDkCartridgePlateLayout,
  DK_PALETTE,
  enrichDkCallouts,
} from './dkEditorialData';
import {
  DkActualSizeCartridgePlate,
  DkAnnotatedPlateOverlay,
  DkCircularLoupeStrip,
  DkEvolutionTimelineStrip,
  DkLoupeHeroConnectorOverlay,
  DkTrueScaleRuler,
} from './DkVectorComponents';
import {
  MONOGRAPH_PLATE_KEYS,
  type MonographCaptureBundle,
  type MonographEdition,
  type MonographLayoutMode,
  type MonographPageMode,
} from './monographCaptureStore';
import type { MonographDossierData } from './monographDataAssembler';
import {
  formatMonographDriveSpec,
  getDkEncyclopediaStrings,
  getMonographDomainLabels,
} from './monographStrings';
import {
  BallisticsVectorChart,
  CaliberEnergyLadder,
} from './MonographVectorCharts';

export interface MonographDkDocumentProps {
  dossier: MonographDossierData;
  captureBundle: MonographCaptureBundle | null;
  edition?: MonographEdition;
  layoutMode: MonographLayoutMode;
  pageMode: MonographPageMode;
  collectorCallsign: string;
  prepress?: boolean;
}

const BLEED_MM = 3;

const DkPrepressCropMarks: React.FC<{
  trimWidthMm: number;
  trimHeightMm: number;
  isSpread: boolean;
}> = ({ trimWidthMm, trimHeightMm, isSpread }) => {
  const b = BLEED_MM;
  const W = trimWidthMm + b * 2;
  const H = trimHeightMm + b * 2;
  const markLen = 2.2;
  const xL = b;
  const xR = b + trimWidthMm;
  const yT = b;
  const yB = b + trimHeightMm;
  const midX = W * 0.5;

  return (
    <svg
      className="dk-prepress-crop-marks"
      data-prepress-marks="true"
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
    >
      {/* Top-Left Trim Corner */}
      <line x1={xL} y1={0} x2={xL} y2={markLen} />
      <line x1={0} y1={yT} x2={markLen} y2={yT} />
      {/* Top-Right Trim Corner */}
      <line x1={xR} y1={0} x2={xR} y2={markLen} />
      <line x1={W - markLen} y1={yT} x2={W} y2={yT} />
      {/* Bottom-Left Trim Corner */}
      <line x1={xL} y1={H - markLen} x2={xL} y2={H} />
      <line x1={0} y1={yB} x2={markLen} y2={yB} />
      {/* Bottom-Right Trim Corner */}
      <line x1={xR} y1={H - markLen} x2={xR} y2={H} />
      <line x1={W - markLen} y1={yB} x2={W} y2={yB} />
      {/* Spine Center Fold Registration Ticks for A3 Double-Page Spreads */}
      {isSpread && (
        <>
          <line x1={midX} y1={0} x2={midX} y2={markLen} className="is-fold" />
          <line
            x1={midX}
            y1={H - markLen}
            x2={midX}
            y2={H}
            className="is-fold"
          />
        </>
      )}
    </svg>
  );
};

const DkFramelessPlate: React.FC<{
  src?: string;
  alt: string;
  placeholder: string;
  className?: string;
}> = ({ src, alt, placeholder, className = '' }) => {
  if (!src) {
    return (
      <div className={`dk-plate-placeholder ${className}`.trim()}>
        <span className="dk-plate-placeholder-dot" aria-hidden="true" />
        <span>{placeholder}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`dk-plate-img ${className}`.trim()}
      loading="eager"
      decoding="sync"
    />
  );
};

const DkSheetRunningHeader: React.FC<{
  leftPrimary: string;
  leftSecondary: string;
  rightPrimary: string;
  rightSecondary: string;
}> = ({ leftPrimary, leftSecondary, rightPrimary, rightSecondary }) => (
  <header className="dk-running-header">
    <div className="dk-rh-group">
      <span className="dk-rh-kicker">{leftPrimary}</span>
      <span className="dk-rh-sep" aria-hidden="true">
        /
      </span>
      <span className="dk-rh-sub">{leftSecondary}</span>
    </div>
    <div className="dk-rh-group is-right">
      <span className="dk-rh-model">{rightPrimary}</span>
      <span className="dk-rh-sep" aria-hidden="true">
        ·
      </span>
      <span className="dk-rh-stamp">{rightSecondary}</span>
    </div>
  </header>
);

const DkSpreadRunningFooter: React.FC<{
  leftPage: number;
  rightPage: number;
  serialCode: string;
  collectorLabel: string;
  folioLabel: string;
  seriesNote: string;
}> = ({
  leftPage,
  rightPage,
  serialCode,
  collectorLabel,
  folioLabel,
  seriesNote,
}) => (
  <footer className="dk-running-footer is-spread">
    <div className="dk-rf-left">
      <span className="dk-rf-page-num">{String(leftPage).padStart(2, '0')}</span>
      <span className="dk-rf-meta">{serialCode}</span>
    </div>
    <div className="dk-rf-center">
      <span>{collectorLabel}</span>
      <span aria-hidden="true">·</span>
      <span>{seriesNote}</span>
      <span aria-hidden="true">·</span>
      <span>{folioLabel}</span>
    </div>
    <div className="dk-rf-right">
      <span className="dk-rf-meta">{seriesNote}</span>
      <span className="dk-rf-page-num">
        {String(rightPage).padStart(2, '0')}
      </span>
    </div>
  </footer>
);

const DkSingleRunningFooter: React.FC<{
  pageNum: number;
  serialCode: string;
  collectorLabel: string;
  folioLabel: string;
}> = ({ pageNum, serialCode, collectorLabel, folioLabel }) => (
  <footer className="dk-running-footer is-single">
    <span className="dk-rf-meta">{serialCode}</span>
    <span className="dk-rf-center">{collectorLabel}</span>
    <span className="dk-rf-right">
      <span className="dk-rf-meta">{folioLabel}</span>
      <span className="dk-rf-page-num">{String(pageNum).padStart(2, '0')}</span>
    </span>
  </footer>
);

function shortenDkMaterial(raw: string, isZh: boolean): string {
  const clean = raw
    .replace(/\s*[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (isZh) {
    return clean.split(/[·,/／、]/)[0]?.trim().slice(0, 12) || clean;
  }
  const words = clean.split(/\s+/).filter(Boolean);
  return words.slice(0, 3).join(' ');
}

/**
 * Distills a breakthrough summary cleanly at a natural sentence or clause boundary
 * so print cards never wrap into mid-word `...` line-clamp truncations.
 */
export function distillBreakthroughSummary(
  raw: string,
  lang: 'zh' | 'en'
): string {
  const cleaned = raw
    .replace(/(?:…|\.\.\.)+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  if (lang === 'zh') {
    const MAX_ZH = 50;
    const sentences = cleaned
      .split(/[。；;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const first = sentences[0] ?? cleaned;
    if (first.length <= MAX_ZH) {
      return `${first.replace(/[，,、：:\s]+$/g, '')}。`;
    }
    const clauses = first
      .split('，')
      .map((c) => c.trim())
      .filter(Boolean);
    let built = '';
    for (const clause of clauses) {
      const next = built ? `${built}，${clause}` : clause;
      if (next.length <= MAX_ZH) {
        built = next;
      } else {
        break;
      }
    }
    const out = (built || clauses[0] || first.slice(0, MAX_ZH))
      .replace(/[，,；;：:、的与及和并使令将把在\s]+$/g, '')
      .trim();
    return `${out}。`;
  }

  const MAX_EN = 112;
  const sentences = cleaned
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((s) => s.replace(/\.+$/g, '').trim())
    .filter(Boolean);
  const first = sentences[0] ?? cleaned.replace(/\.+$/g, '').trim();
  if (first.length <= MAX_EN) {
    return `${first}.`;
  }

  const clauseDelims = [' — ', ', while ', ', ensuring ', ', allowing ', ', '];
  for (const delim of clauseDelims) {
    let idx = first.lastIndexOf(delim, MAX_EN - 1);
    while (idx >= 48) {
      const cand = first.slice(0, idx).replace(/[,;:\-–—\s]+$/g, '').trim();
      if (cand.length >= 48 && cand.length <= MAX_EN - 1) {
        return `${cand}.`;
      }
      idx = first.lastIndexOf(delim, idx - 1);
    }
  }

  const words = first.split(/\s+/);
  let built = '';
  for (const w of words) {
    const next = built ? `${built} ${w}` : w;
    if (next.length <= MAX_EN - 1) {
      built = next;
    } else {
      break;
    }
  }
  const trimmed = built
    .replace(
      /\b(?:a|an|the|of|in|on|at|to|for|with|by|from|into|and|or|but|as|that|which|while|during)$/i,
      ''
    )
    .replace(/[,;:\-–—\s]+$/g, '')
    .trim();
  return `${trimmed || built.trim()}.`;
}

export const MonographDkDocument: React.FC<MonographDkDocumentProps> = ({
  dossier,
  captureBundle,
  edition = 'dk_encyclopedia',
  layoutMode,
  pageMode,
  collectorCallsign,
  prepress = false,
}) => {
  const { lang } = dossier;
  const isZh = lang === 'zh';
  const ui = UI_STRINGS[lang].monograph;
  const domain = getMonographDomainLabels(lang, dossier.isArchery, dossier.isTank);
  const dk = getDkEncyclopediaStrings(lang, dossier.isArchery, dossier.isTank);

  const editorial = useMemo(() => assembleDkEditorialPack(dossier), [dossier]);

  const verticalCartridgeLayout = useMemo(
    () =>
      computeDkCartridgePlateLayout(dossier.cartridgeSpec, lang, 'vertical'),
    [dossier.cartridgeSpec, lang]
  );
  // Giant rifle cartridges (.338 Lapua, .50 BMG) and archery projectiles lay horizontally
  // so 1:1 literal mm (or 1:4/1:5 archery) geometry stays 100% unclipped inside the column.
  const useHorizontalCartridge = verticalCartridgeLayout.svgHeightMm > 96;
  const cartridgeOrientation: 'vertical' | 'horizontal' = useHorizontalCartridge
    ? 'horizontal'
    : 'vertical';

  const heroCallouts = useMemo(
    () => enrichDkCallouts(dossier, captureBundle?.dkHeroCallouts ?? []),
    [dossier, captureBundle?.dkHeroCallouts]
  );
  const cutawayCallouts = useMemo(
    () => enrichDkCallouts(dossier, captureBundle?.dkCutawayCallouts ?? []),
    [dossier, captureBundle?.dkCutawayCallouts]
  );
  const explodedCallouts = useMemo(
    () => enrichDkCallouts(dossier, captureBundle?.dkExplodedCallouts ?? []),
    [dossier, captureBundle?.dkExplodedCallouts]
  );

  const plates = captureBundle?.plates ?? null;
  const loupeAnchors = captureBundle?.loupeAnchors;
  const resolvedCollector =
    collectorCallsign.trim() || ui.coverDefaultCollector;

  const totalPages = pageMode === 'full_8p' ? 8 : 4;
  const classification = getExhibitClassification(dossier.weaponId);

  const plateSourceValues = Object.values(captureBundle?.plateSources ?? {});
  const cyclesPlateCount = plateSourceValues.filter(
    (src) => src === 'cycles_4k'
  ).length;
  const is300DpiPrint = captureBundle?.quality === 'print_2880';
  const provenanceLabel =
    cyclesPlateCount > 0
      ? dk.colophonCyclesLabel(cyclesPlateCount, MONOGRAPH_PLATE_KEYS.length)
      : dk.colophonWebglLabel(is300DpiPrint);

  const prepressStamp = prepress
    ? dk.colophonPrepressTag
    : dk.colophonTrimTag;

  const editionStamp =
    edition === 'dk_encyclopedia'
      ? ui.editionStampDk
      : edition === 'blueprint_manual'
        ? ui.editionStampBlueprint
        : ui.editionStampObsidian;

  const heroPlateSrc = plates?.cover_hero ?? plates?.ortho_right;
  const cSpec = dossier.cartridgeSpec;

  const factFileRows = [
    { label: domain.oalLabel, value: dossier.metrics.oal },
    { label: domain.barrelLabel, value: dossier.metrics.barrel },
    { label: domain.weightLabel, value: dossier.metrics.weight },
    { label: domain.muzzleVelLabel, value: dossier.metrics.muzzleVelocity },
    { label: domain.rangeLabel, value: dossier.metrics.effectiveRange },
    {
      label: domain.muzzleEnergy,
      value: dossier.metrics.muzzleEnergyJ,
      accent: true,
    },
  ];

  // Shared Reusable Editorial Blocks
  const renderFactFile = (compact = false) => (
    <section
      className={`dk-fact-file ${compact ? 'is-compact' : ''}`}
      aria-label={dk.factFileHeading}
    >
      <div className="dk-fact-file-head">
        <span className="dk-kicker-label">{dk.factFileHeading}</span>
        <span className="dk-fact-caliber">{dossier.caliberLabel}</span>
      </div>
      <dl className="dk-fact-grid">
        {factFileRows.map((item) => (
          <div
            key={item.label}
            className={`dk-fact-cell ${item.accent ? 'is-accent' : ''}`}
          >
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="dk-fact-mech-row">
        <span className="dk-fact-mech-k">{domain.mechanismLabel}</span>
        <span className="dk-fact-mech-v">{dossier.actionMechanism}</span>
      </div>
    </section>
  );

  const renderArchiveSealBlock = (compact = false) => (
    <section
      className={`dk-archive-seal ${compact ? 'is-compact' : ''}`}
      aria-label={dk.exLibrisHeading}
    >
      <div className="dk-seal-qr-box">
        <svg
          viewBox={`0 0 ${dossier.qrSvg.viewSize} ${dossier.qrSvg.viewSize}`}
          className="dk-seal-qr-svg"
          shapeRendering="crispEdges"
          role="img"
          aria-label={dk.qrCompanionHeading}
        >
          <rect
            width={dossier.qrSvg.viewSize}
            height={dossier.qrSvg.viewSize}
            fill="#ffffff"
          />
          <path d={dossier.qrSvg.pathD} fill={DK_PALETTE.ink} />
        </svg>
      </div>
      <div className="dk-seal-body">
        <div className="dk-seal-kicker-row">
          <span className="dk-seal-exlibris">{dk.exLibrisHeading}</span>
          <span className="dk-seal-serial">{dossier.serialCode}</span>
        </div>
        <div className="dk-seal-holder-row">
          <span className="dk-seal-holder-label">
            {ui.coverCollectorLabel}:
          </span>
          <strong className="dk-seal-holder-name">{resolvedCollector}</strong>
        </div>
        <div className="dk-seal-qr-title">{dk.qrCompanionHeading}</div>
        {!compact && <p className="dk-seal-qr-sub">{dk.qrCompanionSub}</p>}
        <div className="dk-seal-url">{dossier.deepLinkUrl}</div>
        <div className="dk-seal-colophon-strip">
          <span>{provenanceLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{prepressStamp}</span>
        </div>
      </div>
    </section>
  );

  const renderCartridgeAndBallistics = () => (
    <div
      className={`dk-ballistics-zone ${
        useHorizontalCartridge ? 'is-stacked' : 'is-side-by-side'
      }`}
    >
      <div className="dk-cartridge-col">
        <div className="dk-subhead-rule">
          <span>{dk.cartridgeHeading}</span>
          <span className="dk-mono-tag">{cSpec.code}</span>
        </div>
        <div className="dk-cartridge-plate-wrap">
          <DkActualSizeCartridgePlate
            cartridgeSpec={cSpec}
            lang={lang}
            orientation={cartridgeOrientation}
          />
        </div>
      </div>

      <div className="dk-curve-col">
        <div className="dk-subhead-rule">
          <span>{dk.ballisticsHeading}</span>
          <span className="dk-mono-tag">
            {dossier.ballisticsSpec.standard}
          </span>
        </div>
        <div className="dk-ballistics-chart-wrap">
          <BallisticsVectorChart
            weaponId={dossier.weaponId}
            caliber={dossier.caliberProfile}
            edition="blueprint_manual"
            lang={lang}
          />
        </div>
        <dl className="dk-ammo-micro-ledger">
          <div>
            <dt>{domain.coreAnatomyLabel}</dt>
            <dd>{isZh ? cSpec.coreAnatomyZh : cSpec.coreAnatomyEn}</dd>
          </div>
          <div>
            <dt>{domain.propellantLabel}</dt>
            <dd>{formatMonographDriveSpec(cSpec, dossier.isArchery, lang)}</dd>
          </div>
          <div>
            <dt>{domain.primerLabel}</dt>
            <dd>{isZh ? cSpec.primerTypeZh : cSpec.primerTypeEn}</dd>
          </div>
        </dl>
      </div>
    </div>
  );

  // ==========================================================================
  // LAYOUT A: DK DOUBLE-PAGE SPREAD (420×297mm A3 Landscape · 4 or 2 Spreads)
  // ==========================================================================
  if (layoutMode === 'spread_a3') {
    const spread3LeftPage = pageMode === 'full_8p' ? 5 : 3;
    const spread3RightPage = pageMode === 'full_8p' ? 6 : 4;

    return (
      <div
        className={`monograph-document dk-monograph dk-layout-spread_a3 edition-${edition} ${
          prepress ? 'is-prepress-bleed' : ''
        }`}
        data-style="dk_encyclopedia"
        data-edition={edition}
        data-layout="spread_a3"
        data-pages={pageMode}
        data-prepress={prepress ? '1' : '0'}
      >
        {/* ==================== SPREAD 1 (PP. 01–02): ICONIC HERO GATEFOLD & LOUPES ==================== */}
        <section
          className={`dk-spread-sheet ${prepress ? 'has-bleed' : ''}`}
          data-spread="1"
          data-pages-range="1-2"
        >
          {prepress && (
            <DkPrepressCropMarks trimWidthMm={420} trimHeightMm={297} isSpread />
          )}
          <div className="dk-sheet-trim-area">
            <div className="dk-spread-gutter" aria-hidden="true" />

            <DkSheetRunningHeader
              leftPrimary={`VOL.${String(dossier.volumeIndex).padStart(2, '0')} · ${dossier.bayCode}`}
              leftSecondary={dk.seriesWordmark}
              rightPrimary={dossier.modelCode}
              rightSecondary={dk.spread1Section}
            />

            <div className="dk-spread-body dk-s1-body">
              {/* Top 12-Column Editorial Masthead (Verso) + Spec Fact File (Recto) */}
              <div className="dk-s1-top-band">
                <div className="dk-masthead-block">
                  <div className="dk-crimson-rule" />
                  <div className="dk-masthead-meta">
                    <span className="dk-origin-stamp">{dossier.originTag}</span>
                    <span className="dk-era-dot" aria-hidden="true">
                      ·
                    </span>
                    <span className="dk-taxonomy-code">
                      {classification.driveFamily.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>
                  <h1 className="dk-display-title">{dossier.name}</h1>
                  <p className="dk-intro-deck">{dossier.description}</p>
                </div>

                {renderFactFile(false)}
              </div>

              {/* Center Hero Gatefold sweeping boldly across the spine */}
              <div className="dk-hero-gatefold">
                <div className="dk-plate-16x10 dk-hero-stage">
                  <DkFramelessPlate
                    src={heroPlateSrc}
                    alt={dossier.name}
                    placeholder={dk.capturingPlate(dossier.shortTag)}
                  />
                  <DkAnnotatedPlateOverlay
                    callouts={heroCallouts}
                    accentColor={DK_PALETTE.crimson}
                  />
                </div>
              </div>

              {/* Lower Feature Strip: 4 Circular Optical Loupes + Calibrated Scale Ruler */}
              <div className="dk-s1-lower-band">
                <div className="dk-s1-loupes-col">
                  <div className="dk-subhead-rule">
                    <span>{dk.loupesHeading}</span>
                    <span className="dk-mono-tag">{dk.loupesSub}</span>
                  </div>
                  <DkCircularLoupeStrip
                    loupes={editorial.loupeSpecs}
                    plates={plates}
                    heroRelation="none"
                    diameterPx={72}
                    lang={lang}
                  />
                </div>

                <div className="dk-s1-ruler-col">
                  <div className="dk-subhead-rule">
                    <span>{dk.scaleRulerKicker}</span>
                    <span className="dk-mono-tag">
                      {Math.round(editorial.scaleReference.oalMm)} mm
                    </span>
                  </div>
                  <DkTrueScaleRuler
                    scaleRef={editorial.scaleReference}
                    lang={lang}
                    exhibitLabel={dossier.shortTag}
                    isArchery={dossier.isArchery}
                    isTank={dossier.isTank}
                  />
                </div>
              </div>

              {/* Bottom Full-Spread Evolutionary Lineage Timeline */}
              <div className="dk-s1-timeline-band">
                <DkEvolutionTimelineStrip
                  nodes={editorial.evolutionTimeline}
                  lang={lang}
                />
              </div>
            </div>

            <DkSpreadRunningFooter
              leftPage={1}
              rightPage={2}
              serialCode={dossier.serialCode}
              collectorLabel={resolvedCollector}
              folioLabel={dk.spreadFolioLabel(1, 2, totalPages)}
              seriesNote={editionStamp}
            />
          </div>
        </section>

        {/* ==================== SPREAD 2 (PP. 03–04, full_8p only): CHRONICLE, CUTAWAY & 1:1 AMMO ==================== */}
        {pageMode === 'full_8p' && (
          <section
            className={`dk-spread-sheet ${prepress ? 'has-bleed' : ''}`}
            data-spread="2"
            data-pages-range="3-4"
          >
            {prepress && (
              <DkPrepressCropMarks
                trimWidthMm={420}
                trimHeightMm={297}
                isSpread
              />
            )}
            <div className="dk-sheet-trim-area">
              <div className="dk-spread-gutter" aria-hidden="true" />

              <DkSheetRunningHeader
                leftPrimary={dk.spread2LeftKicker}
                leftSecondary={dossier.name}
                rightPrimary={dk.spread2RightKicker}
                rightSecondary={dossier.caliberLabel}
              />

              <div className="dk-spread-body dk-two-page-split">
                {/* Left Verso Page: 4-Act Historical R&D Chronicle + Elevations */}
                <div className="dk-verso-page dk-s2-left">
                  <div className="dk-chapter-banner">
                    <span className="dk-chapter-kicker">
                      {dk.chronicleHeading}
                    </span>
                    <h2 className="dk-chapter-serif-title">
                      {dossier.headline}
                    </h2>
                    <p className="dk-chapter-deck">{dossier.deck}</p>
                  </div>

                  <div className="dk-magazine-columns">
                    {dossier.acts.slice(0, 4).map((act, idx) => (
                      <article key={act.id} className="dk-chronicle-act">
                        <div className="dk-act-head">
                          <span className="dk-act-badge">{act.actNumber}</span>
                          <span className="dk-act-era">{act.eraTag}</span>
                        </div>
                        <h3 className="dk-act-title">{act.title}</h3>
                        {act.paragraphs.slice(0, 2).map((para, pIdx) => (
                          <p
                            key={pIdx}
                            className={
                              idx === 0 && pIdx === 0 ? 'dk-dropcap' : ''
                            }
                          >
                            {para}
                          </p>
                        ))}
                      </article>
                    ))}
                  </div>

                  {/* Breakthrough Pull-Quote Callout */}
                  <aside className="dk-breakthrough-pullquote">
                    <div className="dk-subhead-rule">
                      <span>{dk.breakthroughsQuoteKicker}</span>
                    </div>
                    <div className="dk-bt-strip">
                      {dossier.breakthroughs.slice(0, 3).map((bt) => (
                        <div key={bt.id} className="dk-bt-item">
                          <div className="dk-bt-top">
                            <span className="dk-bt-tag">{bt.tag}</span>
                            <strong>{bt.title}</strong>
                          </div>
                          <p>{distillBreakthroughSummary(bt.summary, lang)}</p>
                        </div>
                      ))}
                    </div>
                  </aside>

                  {/* Dual Frameless Orthographic Elevation Profiles */}
                  <div className="dk-elevations-pair">
                    <figure className="dk-elevation-fig">
                      <div className="dk-elevation-stage">
                        <DkFramelessPlate
                          src={plates?.ortho_left}
                          alt={dk.leftProfileLabel}
                          placeholder={dk.capturingPlate(dk.leftProfileLabel)}
                        />
                      </div>
                      <figcaption>{dk.leftProfileLabel}</figcaption>
                    </figure>
                    <figure className="dk-elevation-fig">
                      <div className="dk-elevation-stage">
                        <DkFramelessPlate
                          src={plates?.ortho_top}
                          alt={dk.topProfileLabel}
                          placeholder={dk.capturingPlate(dk.topProfileLabel)}
                        />
                      </div>
                      <figcaption>{dk.topProfileLabel}</figcaption>
                    </figure>
                  </div>
                </div>

                {/* Right Recto Page: Giant Longitudinal Cutaway + 1:1 Actual-Size Cartridge & Ballistics */}
                <div
                  className={`dk-recto-page dk-s2-right ${
                    useHorizontalCartridge ? 'has-stacked-ballistics' : ''
                  }`}
                >
                  <div className="dk-chapter-banner is-compact">
                    <span className="dk-chapter-kicker">
                      {dk.cutawayHeading}
                    </span>
                    <p className="dk-chapter-deck">{dk.cutawaySub}</p>
                  </div>

                  <div className="dk-cutaway-hero-wrap">
                    <div className="dk-plate-16x10 dk-cutaway-stage">
                      <DkFramelessPlate
                        src={plates?.stencil_cutaway}
                        alt={dk.cutawayHeading}
                        placeholder={dk.capturingPlate(dk.cutawayHeading)}
                      />
                      <DkAnnotatedPlateOverlay
                        callouts={cutawayCallouts}
                        accentColor={DK_PALETTE.crimson}
                      />
                    </div>
                  </div>

                  {renderCartridgeAndBallistics()}
                </div>
              </div>

              <DkSpreadRunningFooter
                leftPage={3}
                rightPage={4}
                serialCode={dossier.serialCode}
                collectorLabel={resolvedCollector}
                folioLabel={dk.spreadFolioLabel(3, 4, totalPages)}
                seriesNote={editionStamp}
              />
            </div>
          </section>
        )}

        {/* ==================== SPREAD 3 (PP. 05–06, or 03–04 in compact): EXPLODED BLUEPRINT & BOM ==================== */}
        <section
          className={`dk-spread-sheet ${prepress ? 'has-bleed' : ''}`}
          data-spread={pageMode === 'full_8p' ? '3' : '2'}
          data-pages-range={`${spread3LeftPage}-${spread3RightPage}`}
        >
          {prepress && (
            <DkPrepressCropMarks trimWidthMm={420} trimHeightMm={297} isSpread />
          )}
          <div className="dk-sheet-trim-area">
            <div className="dk-spread-gutter" aria-hidden="true" />

            <DkSheetRunningHeader
              leftPrimary={dk.spread3Kicker}
              leftSecondary={dk.spread3Title}
              rightPrimary={dossier.shortTag}
              rightSecondary={dk.bomDirectoryMeta(
                dossier.bomRows.length,
                dossier.totalTrianglesFormatted
              )}
            />

            <div className="dk-spread-body dk-s3-body">
              {/* Top/Center Sweeping 100% Exploded Blueprint with DK Micro-Copy Callouts */}
              <div className="dk-s3-exploded-zone">
                <div className="dk-exploded-caption-bar">
                  <span className="dk-kicker-label">{dk.explodedHeading}</span>
                  <span className="dk-inline-sub">{dk.explodedSub}</span>
                </div>
                <div className="dk-plate-16x10 dk-exploded-stage">
                  <DkFramelessPlate
                    src={plates?.exploded_bom}
                    alt={dk.explodedHeading}
                    placeholder={dk.capturingPlate(dk.explodedHeading)}
                  />
                  <DkAnnotatedPlateOverlay
                    callouts={explodedCallouts}
                    accentColor={DK_PALETTE.crimson}
                  />
                </div>
              </div>

              {/* Bottom 2-Page Split: Left 6-Role Functional Color Map | Right Multi-Column BOM Directory */}
              <div className="dk-two-page-split dk-s3-lower-split">
                <div className="dk-verso-page dk-s3-roles-col">
                  <div className="dk-subhead-rule">
                    <span>{dk.functionalRolesHeading}</span>
                    <span className="dk-mono-tag">6 SUBSYSTEMS</span>
                  </div>
                  <div className="dk-roles-showcase">
                    <div className="dk-roles-plate-wrap">
                      <DkFramelessPlate
                        src={plates?.functional_roles}
                        alt={dk.functionalRolesHeading}
                        placeholder={dk.capturingPlate(
                          dk.functionalRolesHeading
                        )}
                      />
                    </div>
                    <div className="dk-roles-legend-list">
                      {dossier.roleSummaries.map((role) => (
                        <div key={role.role} className="dk-role-legend-row">
                          <span
                            className="dk-role-dot"
                            style={{ backgroundColor: role.colorHex }}
                          />
                          <div className="dk-role-copy">
                            <div className="dk-role-title-row">
                              <strong>{role.label}</strong>
                              <span className="dk-role-qty">
                                {role.parts.length}
                              </span>
                            </div>
                            <p>{role.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="dk-recto-page dk-s3-bom-col">
                  <div className="dk-subhead-rule">
                    <span>{dk.bomDirectoryHeading}</span>
                    <span className="dk-mono-tag">
                      {dossier.bomRows.length} PCS · {dossier.totalTrianglesFormatted} Δ
                    </span>
                  </div>
                  <div
                    className={`dk-bom-multi-grid ${
                      dossier.bomRows.length >= 26 ? 'is-dense' : ''
                    }`}
                  >
                    {dossier.bomRows.map((row) => (
                      <div key={row.partId} className="dk-bom-entry">
                        <span
                          className="dk-bom-code"
                          style={{ color: row.badgeColor }}
                        >
                          {row.bomCode}
                        </span>
                        <span className="dk-bom-name">{row.primaryName}</span>
                        <span className="dk-bom-mat">
                          {shortenDkMaterial(row.materialLabel, isZh)}
                        </span>
                        <span className="dk-bom-env">{row.envelopeMm}</span>
                      </div>
                    ))}
                  </div>
                  {pageMode === 'compact_4p' && renderArchiveSealBlock(true)}
                </div>
              </div>
            </div>

            <DkSpreadRunningFooter
              leftPage={spread3LeftPage}
              rightPage={spread3RightPage}
              serialCode={dossier.serialCode}
              collectorLabel={resolvedCollector}
              folioLabel={dk.spreadFolioLabel(
                spread3LeftPage,
                spread3RightPage,
                totalPages
              )}
              seriesNote={editionStamp}
            />
          </div>
        </section>

        {/* ==================== SPREAD 4 (PP. 07–08, full_8p only): CYCLE, FIELD-STRIP & ARCHIVE SEAL ==================== */}
        {pageMode === 'full_8p' && (
          <section
            className={`dk-spread-sheet ${prepress ? 'has-bleed' : ''}`}
            data-spread="4"
            data-pages-range="7-8"
          >
            {prepress && (
              <DkPrepressCropMarks
                trimWidthMm={420}
                trimHeightMm={297}
                isSpread
              />
            )}
            <div className="dk-sheet-trim-area">
              <div className="dk-spread-gutter" aria-hidden="true" />

              <DkSheetRunningHeader
                leftPrimary={dk.spread4LeftKicker}
                leftSecondary={dossier.name}
                rightPrimary={dk.spread4RightKicker}
                rightSecondary={dossier.serialCode}
              />

              <div className="dk-spread-body dk-two-page-split">
                {/* Left Verso Page: 4-Phase Action Sequence + 7-Stage Kinematics */}
                <div className="dk-verso-page dk-s4-left">
                  <div className="dk-subhead-rule">
                    <span>{dk.cycleSequenceHeading}</span>
                    <span className="dk-mono-tag">01 → 04</span>
                  </div>

                  <div className="dk-phase-seq-grid">
                    {dk.actionPhases.map((frame, idx) => (
                      <figure key={frame.plateKey} className="dk-phase-card">
                        <div className="dk-phase-img-wrap">
                          <DkFramelessPlate
                            src={plates?.[frame.plateKey]}
                            alt={frame.title}
                            placeholder={dk.capturingPlate(frame.title)}
                          />
                        </div>
                        <figcaption className="dk-phase-caption">
                          <div className="dk-phase-head">
                            <span className="dk-phase-num-badge">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <strong>{frame.title}</strong>
                          </div>
                          <p>{frame.caption}</p>
                        </figcaption>
                      </figure>
                    ))}
                  </div>

                  <div className="dk-cycle7-panel">
                    <div className="dk-subhead-rule">
                      <span>{dk.cycle7Heading}</span>
                      <span className="dk-mono-tag">7 STAGES</span>
                    </div>
                    <ol className="dk-cycle7-list">
                      {dossier.firingPhases.map((ph) => (
                        <li key={ph.stepNum} className="dk-cycle7-row">
                          <span className="dk-c7-num">{ph.stepNum}</span>
                          <strong className="dk-c7-label">
                            {ph.shortLabel}
                          </strong>
                          <span className="dk-c7-desc">{ph.description}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>

                {/* Right Recto Page: Field-Strip DAG, Stoppages, Energy Ladder & Archive Seal */}
                <div className="dk-recto-page dk-s4-right">
                  <section className="dk-fieldstrip-panel">
                    <div className="dk-subhead-rule">
                      <span>{dk.fieldStripHeading}</span>
                      <span className="dk-mono-tag">
                        {dossier.fieldStripManualTitle}
                      </span>
                    </div>
                    <ol className="dk-fs-list">
                      {dossier.fieldStripRows.map((row) => (
                        <li key={row.orderLabel} className="dk-fs-item">
                          <div className="dk-fs-top">
                            <span className="dk-fs-ord">{row.orderLabel}</span>
                            <strong>{row.title}</strong>
                          </div>
                          <p className="dk-fs-hint">{row.actionHint}</p>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section className="dk-stoppages-panel">
                    <div className="dk-subhead-rule">
                      <span>{dk.malfunctionsHeading}</span>
                      <span className="dk-mono-tag">4 DIAGNOSTICS</span>
                    </div>
                    <div className="dk-malf-grid">
                      {dossier.malfunctionCards.map((mc) => (
                        <div key={mc.code} className="dk-malf-item">
                          <div className="dk-malf-head">
                            <span className="dk-malf-code">{mc.code}</span>
                            <strong>{mc.title}</strong>
                          </div>
                          <p className="dk-malf-cause">{mc.rootCause}</p>
                          <div className="dk-malf-drill">{mc.drillSummary}</div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="dk-ladder-panel">
                    <div className="dk-subhead-rule">
                      <span>{dk.energyLadderHeading}</span>
                      <span className="dk-mono-tag">
                        {dossier.metrics.muzzleEnergyJ}
                      </span>
                    </div>
                    <CaliberEnergyLadder
                      activeCaliber={dossier.caliberProfile}
                      lang={lang}
                    />
                  </section>

                  {renderArchiveSealBlock(false)}
                </div>
              </div>

              <DkSpreadRunningFooter
                leftPage={7}
                rightPage={8}
                serialCode={dossier.serialCode}
                collectorLabel={resolvedCollector}
                folioLabel={dk.spreadFolioLabel(7, 8, totalPages)}
                seriesNote={editionStamp}
              />
            </div>
          </section>
        )}
      </div>
    );
  }

  // ==========================================================================
  // LAYOUT B: DK SINGLE-PAGE PORTRAIT (210×297mm A4 Portrait · 8 or 4 Pages)
  // ==========================================================================
  const pCutawayNum = pageMode === 'full_8p' ? 4 : 2;
  const pExplodedNum = pageMode === 'full_8p' ? 5 : 3;
  const pFinalNum = pageMode === 'full_8p' ? 8 : 4;

  return (
    <div
      className={`monograph-document dk-monograph dk-layout-portrait_a4 edition-${edition} ${
        prepress ? 'is-prepress-bleed' : ''
      }`}
      data-style="dk_encyclopedia"
      data-edition={edition}
      data-layout="portrait_a4"
      data-pages={pageMode}
      data-prepress={prepress ? '1' : '0'}
    >
      {/* ==================== A4 PAGE 01: ICONIC COVER, ANNOTATED HERO & TRUE-SCALE RULER ==================== */}
      <article
        className={`dk-page-sheet ${prepress ? 'has-bleed' : ''}`}
        data-page="1"
      >
        {prepress && (
          <DkPrepressCropMarks
            trimWidthMm={210}
            trimHeightMm={297}
            isSpread={false}
          />
        )}
        <div className="dk-sheet-trim-area">
          <DkSheetRunningHeader
            leftPrimary={`VOL.${String(dossier.volumeIndex).padStart(2, '0')} · ${dossier.bayCode}`}
            leftSecondary={dk.seriesWordmarkCompact}
            rightPrimary={dossier.shortTag}
            rightSecondary={dk.a4EditionTag}
          />

          <div className="dk-a4-body dk-a4-p1-body">
            <div className="dk-masthead-block">
              <div className="dk-crimson-rule" />
              <div className="dk-masthead-meta">
                <span className="dk-origin-stamp">{dossier.originTag}</span>
                <span className="dk-era-dot" aria-hidden="true">
                  ·
                </span>
                <span className="dk-taxonomy-code">{dk.seriesSubtitle}</span>
              </div>
              <h1 className="dk-display-title is-a4">{dossier.name}</h1>
              <p className="dk-intro-deck">{dossier.description}</p>
            </div>

            <div className="dk-a4-hero-wrap">
              <div className="dk-plate-16x10 dk-a4-hero-stage">
                <DkFramelessPlate
                  src={heroPlateSrc}
                  alt={dossier.name}
                  placeholder={dk.capturingPlate(dossier.shortTag)}
                />
                <DkAnnotatedPlateOverlay
                  callouts={heroCallouts}
                  accentColor={DK_PALETTE.crimson}
                />
              </div>
            </div>

            {renderFactFile(true)}

            <div className="dk-a4-ruler-wrap">
              <div className="dk-subhead-rule">
                <span>{dk.scaleRulerKicker}</span>
                <span className="dk-mono-tag">
                  {Math.round(editorial.scaleReference.oalMm)} mm
                </span>
              </div>
              <DkTrueScaleRuler
                scaleRef={editorial.scaleReference}
                lang={lang}
                exhibitLabel={dossier.shortTag}
                isArchery={dossier.isArchery}
                isTank={dossier.isTank}
              />
            </div>
          </div>

          <DkSingleRunningFooter
            pageNum={1}
            serialCode={dossier.serialCode}
            collectorLabel={resolvedCollector}
            folioLabel={dk.singlePageFolioLabel(1, totalPages)}
          />
        </div>
      </article>

      {/* ==================== A4 PAGES 02 & 03 (full_8p only): LOUPES + LINEAGE & R&D CHRONICLE ==================== */}
      {pageMode === 'full_8p' && (
        <>
          <article
            className={`dk-page-sheet ${prepress ? 'has-bleed' : ''}`}
            data-page="2"
          >
            {prepress && (
              <DkPrepressCropMarks
                trimWidthMm={210}
                trimHeightMm={297}
                isSpread={false}
              />
            )}
            <div className="dk-sheet-trim-area">
              <DkSheetRunningHeader
                leftPrimary={dk.loupesHeading}
                leftSecondary={dossier.shortTag}
                rightPrimary={dossier.bayCode}
                rightSecondary={dk.rightProfileLabel}
              />

              <div className="dk-a4-body dk-a4-p2-body">
                <div className="dk-chapter-banner is-compact">
                  <span className="dk-chapter-kicker">{dk.loupesHeading}</span>
                  <p className="dk-chapter-deck">{dk.loupesSub}</p>
                </div>

                <div className="dk-a4-profile-loupe-stage">
                  <div className="dk-plate-16x10 dk-a4-profile-box">
                    <DkFramelessPlate
                      src={plates?.ortho_right ?? heroPlateSrc}
                      alt={dk.rightProfileLabel}
                      placeholder={dk.capturingPlate(dk.rightProfileLabel)}
                    />
                    <DkLoupeHeroConnectorOverlay
                      loupes={editorial.loupeSpecs}
                      loupeAnchors={loupeAnchors}
                      stripEdge="bottom"
                    />
                  </div>
                </div>

                <DkCircularLoupeStrip
                  loupes={editorial.loupeSpecs}
                  plates={plates}
                  heroRelation="none"
                  diameterPx={78}
                  lang={lang}
                />

                <div className="dk-a4-timeline-footer">
                  <DkEvolutionTimelineStrip
                    nodes={editorial.evolutionTimeline}
                    lang={lang}
                  />
                </div>
              </div>

              <DkSingleRunningFooter
                pageNum={2}
                serialCode={dossier.serialCode}
                collectorLabel={resolvedCollector}
                folioLabel={dk.singlePageFolioLabel(2, totalPages)}
              />
            </div>
          </article>

          <article
            className={`dk-page-sheet ${prepress ? 'has-bleed' : ''}`}
            data-page="3"
          >
            {prepress && (
              <DkPrepressCropMarks
                trimWidthMm={210}
                trimHeightMm={297}
                isSpread={false}
              />
            )}
            <div className="dk-sheet-trim-area">
              <DkSheetRunningHeader
                leftPrimary={dk.spread2LeftKicker}
                leftSecondary={dossier.shortTag}
                rightPrimary={dossier.bayCode}
                rightSecondary={dossier.caliberLabel}
              />

              <div className="dk-a4-body dk-s2-left">
                <div className="dk-chapter-banner">
                  <span className="dk-chapter-kicker">
                    {dk.chronicleHeading}
                  </span>
                  <h2 className="dk-chapter-serif-title">{dossier.headline}</h2>
                  <p className="dk-chapter-deck">{dossier.deck}</p>
                </div>

                <div className="dk-magazine-columns">
                  {dossier.acts.slice(0, 4).map((act, idx) => (
                    <article key={act.id} className="dk-chronicle-act">
                      <div className="dk-act-head">
                        <span className="dk-act-badge">{act.actNumber}</span>
                        <span className="dk-act-era">{act.eraTag}</span>
                      </div>
                      <h3 className="dk-act-title">{act.title}</h3>
                      {act.paragraphs.slice(0, 2).map((para, pIdx) => (
                        <p
                          key={pIdx}
                          className={
                            idx === 0 && pIdx === 0 ? 'dk-dropcap' : ''
                          }
                        >
                          {para}
                        </p>
                      ))}
                    </article>
                  ))}
                </div>

                <aside className="dk-breakthrough-pullquote">
                  <div className="dk-subhead-rule">
                    <span>{dk.breakthroughsQuoteKicker}</span>
                  </div>
                  <div className="dk-bt-strip">
                    {dossier.breakthroughs.slice(0, 3).map((bt) => (
                      <div key={bt.id} className="dk-bt-item">
                        <div className="dk-bt-top">
                          <span className="dk-bt-tag">{bt.tag}</span>
                          <strong>{bt.title}</strong>
                        </div>
                        <p>{distillBreakthroughSummary(bt.summary, lang)}</p>
                      </div>
                    ))}
                  </div>
                </aside>

                <div className="dk-elevations-pair">
                  <figure className="dk-elevation-fig">
                    <div className="dk-elevation-stage">
                      <DkFramelessPlate
                        src={plates?.ortho_left}
                        alt={dk.leftProfileLabel}
                        placeholder={dk.capturingPlate(dk.leftProfileLabel)}
                      />
                    </div>
                    <figcaption>{dk.leftProfileLabel}</figcaption>
                  </figure>
                  <figure className="dk-elevation-fig">
                    <div className="dk-elevation-stage">
                      <DkFramelessPlate
                        src={plates?.ortho_top}
                        alt={dk.topProfileLabel}
                        placeholder={dk.capturingPlate(dk.topProfileLabel)}
                      />
                    </div>
                    <figcaption>{dk.topProfileLabel}</figcaption>
                  </figure>
                </div>
              </div>

              <DkSingleRunningFooter
                pageNum={3}
                serialCode={dossier.serialCode}
                collectorLabel={resolvedCollector}
                folioLabel={dk.singlePageFolioLabel(3, totalPages)}
              />
            </div>
          </article>
        </>
      )}

      {/* ==================== A4 PAGE 04 (or P2 in 4P): CUTAWAY & 1:1 AMMUNITION ==================== */}
      <article
        className={`dk-page-sheet ${prepress ? 'has-bleed' : ''}`}
        data-page={String(pCutawayNum)}
      >
        {prepress && (
          <DkPrepressCropMarks
            trimWidthMm={210}
            trimHeightMm={297}
            isSpread={false}
          />
        )}
        <div className="dk-sheet-trim-area">
          <DkSheetRunningHeader
            leftPrimary={dk.spread2RightKicker}
            leftSecondary={dossier.shortTag}
            rightPrimary={dossier.caliberLabel}
            rightSecondary={dossier.ballisticsSpec.standard}
          />

          <div
            className={`dk-a4-body dk-s2-right ${
              useHorizontalCartridge ? 'has-stacked-ballistics' : ''
            }`}
          >
            <div className="dk-chapter-banner is-compact">
              <span className="dk-chapter-kicker">{dk.cutawayHeading}</span>
              <p className="dk-chapter-deck">{dk.cutawaySub}</p>
            </div>

            <div className="dk-cutaway-hero-wrap">
              <div className="dk-plate-16x10 dk-cutaway-stage">
                <DkFramelessPlate
                  src={plates?.stencil_cutaway}
                  alt={dk.cutawayHeading}
                  placeholder={dk.capturingPlate(dk.cutawayHeading)}
                />
                <DkAnnotatedPlateOverlay
                  callouts={cutawayCallouts}
                  accentColor={DK_PALETTE.crimson}
                />
              </div>
            </div>

            {renderCartridgeAndBallistics()}
          </div>

          <DkSingleRunningFooter
            pageNum={pCutawayNum}
            serialCode={dossier.serialCode}
            collectorLabel={resolvedCollector}
            folioLabel={dk.singlePageFolioLabel(pCutawayNum, totalPages)}
          />
        </div>
      </article>

      {/* ==================== A4 PAGE 05 (or P3 in 4P): EXPLODED BLUEPRINT & 6-ROLE MAP ==================== */}
      <article
        className={`dk-page-sheet ${prepress ? 'has-bleed' : ''}`}
        data-page={String(pExplodedNum)}
      >
        {prepress && (
          <DkPrepressCropMarks
            trimWidthMm={210}
            trimHeightMm={297}
            isSpread={false}
          />
        )}
        <div className="dk-sheet-trim-area">
          <DkSheetRunningHeader
            leftPrimary={dk.spread3Kicker}
            leftSecondary={dossier.shortTag}
            rightPrimary={dossier.bayCode}
            rightSecondary={`${dossier.bomRows.length} PCS`}
          />

          <div className="dk-a4-body dk-a4-p5-body">
            <div className="dk-chapter-banner is-compact">
              <span className="dk-chapter-kicker">{dk.explodedHeading}</span>
              <p className="dk-chapter-deck">{dk.explodedSub}</p>
            </div>

            <div className="dk-a4-exploded-wrap">
              <div className="dk-plate-16x10 dk-a4-exploded-stage">
                <DkFramelessPlate
                  src={plates?.exploded_bom}
                  alt={dk.explodedHeading}
                  placeholder={dk.capturingPlate(dk.explodedHeading)}
                />
                <DkAnnotatedPlateOverlay
                  callouts={explodedCallouts}
                  accentColor={DK_PALETTE.crimson}
                />
              </div>
            </div>

            <div className="dk-a4-roles-section">
              <div className="dk-subhead-rule">
                <span>{dk.functionalRolesHeading}</span>
                <span className="dk-mono-tag">6 SUBSYSTEMS</span>
              </div>
              <div className="dk-roles-showcase">
                <div className="dk-roles-plate-wrap">
                  <DkFramelessPlate
                    src={plates?.functional_roles}
                    alt={dk.functionalRolesHeading}
                    placeholder={dk.capturingPlate(dk.functionalRolesHeading)}
                  />
                </div>
                <div className="dk-roles-legend-list">
                  {dossier.roleSummaries.map((role) => (
                    <div key={role.role} className="dk-role-legend-row">
                      <span
                        className="dk-role-dot"
                        style={{ backgroundColor: role.colorHex }}
                      />
                      <div className="dk-role-copy">
                        <div className="dk-role-title-row">
                          <strong>{role.label}</strong>
                          <span className="dk-role-qty">
                            {role.parts.length}
                          </span>
                        </div>
                        <p>{role.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DkSingleRunningFooter
            pageNum={pExplodedNum}
            serialCode={dossier.serialCode}
            collectorLabel={resolvedCollector}
            folioLabel={dk.singlePageFolioLabel(pExplodedNum, totalPages)}
          />
        </div>
      </article>

      {/* ==================== A4 PAGES 06 & 07 (full_8p only): FULL BOM LEDGER & CYCLE OF OPERATION ==================== */}
      {pageMode === 'full_8p' && (
        <>
          <article
            className={`dk-page-sheet ${prepress ? 'has-bleed' : ''}`}
            data-page="6"
          >
            {prepress && (
              <DkPrepressCropMarks
                trimWidthMm={210}
                trimHeightMm={297}
                isSpread={false}
              />
            )}
            <div className="dk-sheet-trim-area">
              <DkSheetRunningHeader
                leftPrimary={dk.bomDirectoryHeading}
                leftSecondary={dossier.shortTag}
                rightPrimary={dossier.bayCode}
                rightSecondary={`${dossier.bomRows.length} PCS`}
              />

              <div className="dk-a4-body dk-a4-bom-body">
                <div className="dk-chapter-banner is-compact">
                  <span className="dk-chapter-kicker">
                    {dk.bomDirectoryHeading}
                  </span>
                  <p className="dk-chapter-deck">
                    {dk.bomDirectoryMeta(
                      dossier.bomRows.length,
                      dossier.totalTrianglesFormatted
                    )}
                  </p>
                </div>

                <table
                  className={`dk-bom-table ${
                    dossier.bomRows.length >= 24
                      ? 'is-ultra-dense'
                      : dossier.bomRows.length >= 18
                        ? 'is-compact'
                        : ''
                  }`}
                >
                  <thead>
                    <tr>
                      <th scope="col" className="col-code">
                        {ui.bomColCode}
                      </th>
                      <th scope="col" className="col-name">
                        {ui.bomColComponent}
                      </th>
                      <th scope="col" className="col-mat">
                        {domain.bomColMaterial}
                      </th>
                      <th scope="col" className="col-env">
                        {ui.bomColEnvelope}
                      </th>
                      <th scope="col" className="col-copy">
                        {ui.bomColPrinciple}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.bomRows.map((row) => {
                      const micro = editorial.partMicroCopyById[row.partId];
                      const showSecondaryName = dossier.bomRows.length < 20;
                      return (
                        <tr key={row.partId}>
                          <td className="td-code">
                            <span style={{ color: row.badgeColor }}>
                              {row.bomCode}
                            </span>
                          </td>
                          <td className="td-name">
                            <strong>{row.primaryName}</strong>
                            {showSecondaryName && (
                              <span>{row.secondaryName}</span>
                            )}
                          </td>
                          <td className="td-mat">
                            {shortenDkMaterial(row.materialLabel, isZh)}
                          </td>
                          <td className="td-env">{row.envelopeMm}</td>
                          <td className="td-copy">
                            <span className="dk-bom-copy-text">
                              {micro?.microCopy ?? row.principleText}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="dk-qa-signoff-bar">
                  <div className="dk-qa-left">
                    <span className="dk-kicker-label">ISO 128 / 7200</span>
                    <p>{dk.qaSpecLine}</p>
                  </div>
                  <div className="dk-qa-cells">
                    <div>
                      <span>{dk.qaDatumLabel}</span>
                      <strong>+X · +Y · +Z (mm)</strong>
                    </div>
                    <div>
                      <span>{dk.qaMeshLabel}</span>
                      <strong>
                        {dossier.bomRows.length} ·{' '}
                        {dossier.totalTrianglesFormatted} Δ
                      </strong>
                    </div>
                    <div className="is-verified">
                      <span>{dk.qaSignoffLabel}</span>
                      <strong>{dk.qaSignoffValue}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <DkSingleRunningFooter
                pageNum={6}
                serialCode={dossier.serialCode}
                collectorLabel={resolvedCollector}
                folioLabel={dk.singlePageFolioLabel(6, totalPages)}
              />
            </div>
          </article>

          <article
            className={`dk-page-sheet ${prepress ? 'has-bleed' : ''}`}
            data-page="7"
          >
            {prepress && (
              <DkPrepressCropMarks
                trimWidthMm={210}
                trimHeightMm={297}
                isSpread={false}
              />
            )}
            <div className="dk-sheet-trim-area">
              <DkSheetRunningHeader
                leftPrimary={dk.spread4LeftKicker}
                leftSecondary={dossier.shortTag}
                rightPrimary={dossier.bayCode}
                rightSecondary="01 → 07"
              />

              <div className="dk-a4-body dk-s4-left">
                <div className="dk-subhead-rule">
                  <span>{dk.cycleSequenceHeading}</span>
                  <span className="dk-mono-tag">01 → 04</span>
                </div>

                <div className="dk-phase-seq-grid">
                  {dk.actionPhases.map((frame, idx) => (
                    <figure key={frame.plateKey} className="dk-phase-card">
                      <div className="dk-phase-img-wrap">
                        <DkFramelessPlate
                          src={plates?.[frame.plateKey]}
                          alt={frame.title}
                          placeholder={dk.capturingPlate(frame.title)}
                        />
                      </div>
                      <figcaption className="dk-phase-caption">
                        <div className="dk-phase-head">
                          <span className="dk-phase-num-badge">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <strong>{frame.title}</strong>
                        </div>
                        <p>{frame.caption}</p>
                      </figcaption>
                    </figure>
                  ))}
                </div>

                <div className="dk-cycle7-panel">
                  <div className="dk-subhead-rule">
                    <span>{dk.cycle7Heading}</span>
                    <span className="dk-mono-tag">7 STAGES</span>
                  </div>
                  <ol className="dk-cycle7-list">
                    {dossier.firingPhases.map((ph) => (
                      <li key={ph.stepNum} className="dk-cycle7-row">
                        <span className="dk-c7-num">{ph.stepNum}</span>
                        <strong className="dk-c7-label">{ph.shortLabel}</strong>
                        <span className="dk-c7-desc">{ph.description}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <DkSingleRunningFooter
                pageNum={7}
                serialCode={dossier.serialCode}
                collectorLabel={resolvedCollector}
                folioLabel={dk.singlePageFolioLabel(7, totalPages)}
              />
            </div>
          </article>
        </>
      )}

      {/* ==================== A4 PAGE 08 (or P4 in 4P): FIELD-STRIP, STOPPAGES & ARCHIVE SEAL ==================== */}
      <article
        className={`dk-page-sheet ${prepress ? 'has-bleed' : ''}`}
        data-page={String(pFinalNum)}
      >
        {prepress && (
          <DkPrepressCropMarks
            trimWidthMm={210}
            trimHeightMm={297}
            isSpread={false}
          />
        )}
        <div className="dk-sheet-trim-area">
          <DkSheetRunningHeader
            leftPrimary={dk.a4RightManualKicker}
            leftSecondary={dossier.shortTag}
            rightPrimary={dossier.bayCode}
            rightSecondary={dk.a4EditionTag}
          />

          <div className="dk-a4-body dk-s4-right">
            <section className="dk-fieldstrip-panel">
              <div className="dk-subhead-rule">
                <span>{dk.fieldStripHeading}</span>
                <span className="dk-mono-tag">
                  {dossier.fieldStripManualTitle}
                </span>
              </div>
              <ol className="dk-fs-list">
                {dossier.fieldStripRows.map((row) => (
                  <li key={row.orderLabel} className="dk-fs-item">
                    <div className="dk-fs-top">
                      <span className="dk-fs-ord">{row.orderLabel}</span>
                      <strong>{row.title}</strong>
                    </div>
                    <p className="dk-fs-hint">{row.actionHint}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section className="dk-stoppages-panel">
              <div className="dk-subhead-rule">
                <span>{dk.malfunctionsHeading}</span>
                <span className="dk-mono-tag">4 DIAGNOSTICS</span>
              </div>
              <div className="dk-malf-grid">
                {dossier.malfunctionCards.map((mc) => (
                  <div key={mc.code} className="dk-malf-item">
                    <div className="dk-malf-head">
                      <span className="dk-malf-code">{mc.code}</span>
                      <strong>{mc.title}</strong>
                    </div>
                    <p className="dk-malf-cause">{mc.rootCause}</p>
                    <div className="dk-malf-drill">{mc.drillSummary}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="dk-ladder-panel">
              <div className="dk-subhead-rule">
                <span>{dk.energyLadderHeading}</span>
                <span className="dk-mono-tag">
                  {dossier.metrics.muzzleEnergyJ}
                </span>
              </div>
              <CaliberEnergyLadder
                activeCaliber={dossier.caliberProfile}
                lang={lang}
              />
            </section>

            {pageMode === 'compact_4p' && (
              <div className="dk-compact-timeline-wrap">
                <DkEvolutionTimelineStrip
                  nodes={editorial.evolutionTimeline}
                  lang={lang}
                />
              </div>
            )}

            {renderArchiveSealBlock(pageMode === 'compact_4p')}
          </div>

          <DkSingleRunningFooter
            pageNum={pFinalNum}
            serialCode={dossier.serialCode}
            collectorLabel={resolvedCollector}
            folioLabel={dk.singlePageFolioLabel(pFinalNum, totalPages)}
          />
        </div>
      </article>
    </div>
  );
};

export default MonographDkDocument;
