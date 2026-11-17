import React from 'react';
import {
  Award,
  Boxes,
  Compass,
  Eye,
  Ruler,
  Scale,
  Scissors,
  Smartphone,
  Sparkles,
  Zap,
} from 'lucide-react';
import { UI_STRINGS } from '../../i18n/uiStrings';
import type { MonographDossierData } from './monographDataAssembler';
import type {
  MonographCaptureBundle,
  MonographEdition,
  MonographPageMode,
} from './monographCaptureStore';
import {
  CartridgeCutawayDiagram,
  ExplodedPlateVectorOverlay,
} from './MonographVectorCharts';

export interface MonographKidsDocumentProps {
  dossier: MonographDossierData;
  captureBundle: MonographCaptureBundle | null;
  edition: MonographEdition;
  pageMode: MonographPageMode;
  collectorCallsign: string;
}

const KidsRunningHeader: React.FC<{
  seriesHeader: string;
  bayCode: string;
  shortTag: string;
  editionLabel: string;
}> = ({ seriesHeader, bayCode, shortTag, editionLabel }) => (
  <header className="km-page-header">
    <div className="km-ph-left">
      <span className="km-ph-bay">{bayCode}</span>
      <span className="km-ph-series">{seriesHeader}</span>
    </div>
    <div className="km-ph-right">
      <span className="km-ph-model">{shortTag}</span>
      <span className="km-ph-edition">{editionLabel}</span>
    </div>
  </header>
);

const KidsRunningFooter: React.FC<{
  serialCode: string;
  explorerLabel: string;
  explorerName: string;
  pageLabel: string;
}> = ({ serialCode, explorerLabel, explorerName, pageLabel }) => (
  <footer className="km-page-footer">
    <span className="km-pf-serial">{serialCode}</span>
    <span className="km-pf-explorer">
      {explorerLabel}: <strong>{explorerName}</strong>
    </span>
    <span className="km-pf-page">{pageLabel}</span>
  </footer>
);

const KidsPlatePlaceholder: React.FC<{ label: string }> = ({ label }) => (
  <div className="m-plate-placeholder">
    <div className="m-plate-spinner" />
    <span>{label}</span>
  </div>
);

const FUN_STAT_ICONS = [Ruler, Scale, Boxes, Zap] as const;
const FUN_STAT_TONES = ['sky', 'emerald', 'amber', 'rose'] as const;

export const MonographKidsDocument: React.FC<MonographKidsDocumentProps> = ({
  dossier,
  captureBundle,
  edition,
  pageMode,
  collectorCallsign,
}) => {
  const { lang } = dossier;
  const isZh = lang === 'zh';
  const ui = UI_STRINGS[lang].monograph;
  const kui = ui.kids;

  const editionLabel =
    edition === 'blueprint_manual' ? kui.editionBright : kui.editionDark;
  const explorerName = collectorCallsign.trim() || kui.defaultExplorer;

  const totalPages = pageMode === 'full_8p' ? 8 : 4;
  const plates = captureBundle?.plates ?? null;
  const explodedPins = captureBundle?.explodedPins ?? [];
  const cSpec = dossier.cartridgeSpec;

  return (
    <div
      className={`monograph-document kids-monograph edition-${edition}`}
      data-edition={edition}
      data-style="kids_pictorial"
    >
      {/* ==================== PAGE 01: GIANT HERO POSTER COVER ==================== */}
      <article className="monograph-page km-page" data-page="1">
        <KidsRunningHeader
          seriesHeader={kui.seriesHeader}
          bayCode={`#${String(dossier.volumeIndex).padStart(2, '0')} · ${dossier.bayCode}`}
          shortTag={dossier.shortTag}
          editionLabel={editionLabel}
        />

        <div className="km-page-body km-cover-body">
          <div className="km-cover-top">
            <div className="km-cover-pill-row">
              <span className="km-kicker-pill">
                <Sparkles size={12} aria-hidden="true" />
                <span>{kui.coverBadge}</span>
              </span>
              <span className="km-origin-pill">{dossier.originTag}</span>
            </div>

            <h1 className="km-cover-title">{dossier.name}</h1>
            <p className="km-cover-tagline">{dossier.kidTagline}</p>
          </div>

          {/* Plate #1: Giant Uncropped 3D Studio Hero Photo */}
          <figure className="km-hero-stage">
            {plates?.cover_hero ? (
              <img
                src={plates.cover_hero}
                alt={dossier.name}
                className="km-plate-img"
              />
            ) : (
              <KidsPlatePlaceholder label={`${dossier.shortTag} · 3D HERO`} />
            )}
            <figcaption className="km-hero-floating-sticker">
              <Boxes size={13} aria-hidden="true" />
              <span>{kui.heroSticker(dossier.bomRows.length)}</span>
            </figcaption>
          </figure>

          {/* 4 Big Playful Everyday Comparison Cards */}
          <div className="km-fun-stats-grid">
            {dossier.kidsFunStats.map((st, idx) => {
              const IconComp = FUN_STAT_ICONS[idx];
              const tone = FUN_STAT_TONES[idx];
              return (
                <div key={st.label} className={`km-fun-stat-card tone-${tone}`}>
                  <div className="km-fs-head">
                    <span className="km-fs-icon">
                      <IconComp size={14} aria-hidden="true" />
                    </span>
                    <span className="km-fs-label">{st.label}</span>
                    <strong className="km-fs-val">{st.value}</strong>
                  </div>
                  <p className="km-fs-compare">{st.funCompare}</p>
                </div>
              );
            })}
          </div>

          {/* Bottom Explorer Certificate Bar */}
          <div className="km-explorer-banner">
            <div className="km-eb-left">
              <span className="km-eb-kicker">{kui.funFeaturesLabel}</span>
              <div className="km-eb-chips">
                {dossier.highlights.slice(0, 3).map((h) => (
                  <span key={h} className="km-feature-chip">
                    {h}
                  </span>
                ))}
              </div>
            </div>
            <div className="km-eb-stamp">
              <span className="km-eb-stamp-label">
                <Award size={12} aria-hidden="true" />
                <span>{kui.explorerLabel}</span>
              </span>
              <strong className="km-eb-stamp-name">{explorerName}</strong>
            </div>
          </div>
        </div>

        <KidsRunningFooter
          serialCode={dossier.serialCode}
          explorerLabel={kui.explorerLabel}
          explorerName={explorerName}
          pageLabel={kui.pageFooter(1, totalPages)}
        />
      </article>

      {/* ==================== PAGE 02: 360° THREE GIANT VIEWS (8P MODE) ==================== */}
      {pageMode === 'full_8p' && (
        <article className="monograph-page km-page" data-page="2">
          <KidsRunningHeader
            seriesHeader={kui.seriesHeader}
            bayCode={dossier.bayCode}
            shortTag={dossier.shortTag}
            editionLabel={editionLabel}
          />

          <div className="km-page-body">
            <div className="km-sec-head">
              <span className="km-sec-kicker">
                <Compass size={12} aria-hidden="true" />
                <span>{kui.p2Kicker}</span>
              </span>
              <h2 className="km-sec-title">{kui.p2Title}</h2>
              <p className="km-sec-sub">{kui.p2Sub}</p>
            </div>

            {/* Plates #2, #3, #4: Three Full-Width Uncropped Orthographic Studio Photos */}
            <div className="km-turnaround-stack">
              <figure className="km-turnaround-card">
                <div className="km-turnaround-img-box">
                  {plates?.ortho_right ? (
                    <img
                      src={plates.ortho_right}
                      alt={kui.viewRightTag}
                      className="km-plate-img"
                    />
                  ) : (
                    <KidsPlatePlaceholder label="RIGHT SIDE 3D" />
                  )}
                </div>
                <figcaption className="km-turnaround-badge tone-sky">
                  <span className="km-step-dot">01</span>
                  <strong>{kui.viewRightTag}</strong>
                </figcaption>
              </figure>

              <figure className="km-turnaround-card">
                <div className="km-turnaround-img-box">
                  {plates?.ortho_left ? (
                    <img
                      src={plates.ortho_left}
                      alt={kui.viewLeftTag}
                      className="km-plate-img"
                    />
                  ) : (
                    <KidsPlatePlaceholder label="LEFT SIDE 3D" />
                  )}
                </div>
                <figcaption className="km-turnaround-badge tone-emerald">
                  <span className="km-step-dot">02</span>
                  <strong>{kui.viewLeftTag}</strong>
                </figcaption>
              </figure>

              <figure className="km-turnaround-card">
                <div className="km-turnaround-img-box">
                  {plates?.ortho_top ? (
                    <img
                      src={plates.ortho_top}
                      alt={kui.viewTopTag}
                      className="km-plate-img"
                    />
                  ) : (
                    <KidsPlatePlaceholder label="TOP-DOWN 3D" />
                  )}
                </div>
                <figcaption className="km-turnaround-badge tone-amber">
                  <span className="km-step-dot">03</span>
                  <strong>{kui.viewTopTag}</strong>
                </figcaption>
              </figure>
            </div>
          </div>

          <KidsRunningFooter
            serialCode={dossier.serialCode}
            explorerLabel={kui.explorerLabel}
            explorerName={explorerName}
            pageLabel={kui.pageFooter(2, totalPages)}
          />
        </article>
      )}

      {/* ==================== PAGE 03 (or P2 in 4P): SUPER X-RAY & HALF-CUTAWAY ==================== */}
      <article
        className="monograph-page km-page"
        data-page={pageMode === 'full_8p' ? '3' : '2'}
      >
        <KidsRunningHeader
          seriesHeader={kui.seriesHeader}
          bayCode={dossier.bayCode}
          shortTag={dossier.shortTag}
          editionLabel={editionLabel}
        />

        <div className="km-page-body">
          <div className="km-sec-head">
            <span className="km-sec-kicker">
              <Eye size={12} aria-hidden="true" />
              <span>{kui.p3Kicker}</span>
            </span>
            <h2 className="km-sec-title">{kui.p3Title}</h2>
            <p className="km-sec-sub">{kui.p3Sub}</p>
          </div>

          {/* Plates #5 & #6: Two Giant Full-Bleed Cutaway Posters */}
          <div className="km-double-giant-stack">
            <figure className="km-giant-cutaway-card">
              <div className="km-giant-cutaway-img">
                {plates?.xray_magic ? (
                  <img
                    src={plates.xray_magic}
                    alt={kui.xrayBadge}
                    className="km-plate-img"
                  />
                ) : (
                  <KidsPlatePlaceholder label="X-RAY VISION 3D" />
                )}
              </div>
              <figcaption className="km-giant-caption tone-sky">
                <div className="km-gc-badge">
                  <Eye size={13} aria-hidden="true" />
                  <strong>{kui.xrayBadge}</strong>
                </div>
                <span className="km-gc-tip">{kui.xrayTip}</span>
              </figcaption>
            </figure>

            <figure className="km-giant-cutaway-card">
              <div className="km-giant-cutaway-img">
                {plates?.stencil_cutaway ? (
                  <img
                    src={plates.stencil_cutaway}
                    alt={kui.cutawayBadge}
                    className="km-plate-img"
                  />
                ) : (
                  <KidsPlatePlaceholder label="HALF CUTAWAY 3D" />
                )}
              </div>
              <figcaption className="km-giant-caption tone-amber">
                <div className="km-gc-badge">
                  <Scissors size={13} aria-hidden="true" />
                  <strong>{kui.cutawayBadge}</strong>
                </div>
                <span className="km-gc-tip">{kui.cutawayTip}</span>
              </figcaption>
            </figure>
          </div>
        </div>

        <KidsRunningFooter
          serialCode={dossier.serialCode}
          explorerLabel={kui.explorerLabel}
          explorerName={explorerName}
          pageLabel={kui.pageFooter(pageMode === 'full_8p' ? 3 : 2, totalPages)}
        />
      </article>

      {/* ==================== PAGE 04: RAINBOW 6-TEAM COLOR MAP (8P MODE) ==================== */}
      {pageMode === 'full_8p' && (
        <article className="monograph-page km-page" data-page="4">
          <KidsRunningHeader
            seriesHeader={kui.seriesHeader}
            bayCode={dossier.bayCode}
            shortTag={dossier.shortTag}
            editionLabel={editionLabel}
          />

          <div className="km-page-body">
            <div className="km-sec-head">
              <span className="km-sec-kicker">
                <Sparkles size={12} aria-hidden="true" />
                <span>{kui.p4Kicker}</span>
              </span>
              <h2 className="km-sec-title">{kui.p4Title}</h2>
              <p className="km-sec-sub">{kui.p4Sub}</p>
            </div>

            {/* Plate #7: Giant Rainbow 6-Role 3D Illustration */}
            <figure className="km-rainbow-hero-stage">
              {plates?.functional_roles ? (
                <img
                  src={plates.functional_roles}
                  alt={kui.p4Title}
                  className="km-plate-img"
                />
              ) : (
                <KidsPlatePlaceholder label="RAINBOW 6-TEAM 3D" />
              )}
            </figure>

            {/* 6 Playful Team Color Cards */}
            <div className="km-teams-grid">
              {dossier.roleSummaries.map((r) => (
                <div
                  key={r.role}
                  className="km-team-card"
                  style={{ borderTopColor: r.colorHex }}
                >
                  <div className="km-tc-head">
                    <span
                      className="km-tc-dot"
                      style={{ backgroundColor: r.colorHex }}
                    />
                    <strong className="km-tc-title">{r.kidTeamTitle}</strong>
                    <span className="km-tc-count">
                      {kui.teamPartsUnit(r.parts.length)}
                    </span>
                  </div>
                  <p className="km-tc-tip">{r.kidShortTip}</p>
                  <div className="km-tc-pills">
                    {r.parts.slice(0, 4).map((pt) => (
                      <span key={pt.bomCode} className="km-mini-pill">
                        <b>{pt.bomCode}</b> {pt.name}
                      </span>
                    ))}
                    {r.parts.length > 4 && (
                      <span className="km-mini-pill">
                        +{r.parts.length - 4}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <KidsRunningFooter
            serialCode={dossier.serialCode}
            explorerLabel={kui.explorerLabel}
            explorerName={explorerName}
            pageLabel={kui.pageFooter(4, totalPages)}
          />
        </article>
      )}

      {/* ==================== PAGE 05 (or P3 in 4P): GIANT LEGO EXPLODED POSTER ==================== */}
      <article
        className="monograph-page km-page"
        data-page={pageMode === 'full_8p' ? '5' : '3'}
      >
        <KidsRunningHeader
          seriesHeader={kui.seriesHeader}
          bayCode={dossier.bayCode}
          shortTag={dossier.shortTag}
          editionLabel={editionLabel}
        />

        <div className="km-page-body">
          <div className="km-sec-head">
            <span className="km-sec-kicker">
              <Boxes size={12} aria-hidden="true" />
              <span>{kui.p5Kicker}</span>
            </span>
            <h2 className="km-sec-title">{kui.p5Title}</h2>
            <p className="km-sec-sub">{kui.p5Sub}</p>
          </div>

          {/* Plate #8: Full 100% Exploded 3D Poster + Vector BOM Callout Pins */}
          <figure className="km-exploded-frame">
            <div className="m-exploded-stage">
              {plates?.exploded_bom ? (
                <>
                  <img
                    src={plates.exploded_bom}
                    alt={kui.p5Title}
                    className="km-plate-img is-exact-stage"
                  />
                  <ExplodedPlateVectorOverlay
                    pins={explodedPins}
                    edition={edition}
                  />
                </>
              ) : (
                <KidsPlatePlaceholder label="100% EXPLODED 3D POSTER" />
              )}
            </div>
          </figure>

          {/* Clean Kid-Friendly Treasure-Hunt Part Name Stickers (Zero Dense Prose) */}
          <section className="km-treasure-box">
            <div className="km-treasure-bar">
              <span>{kui.treasureHuntLabel(dossier.bomRows.length)}</span>
            </div>
            <div className="km-treasure-grid">
              {dossier.bomRows.map((row) => (
                <div key={row.partId} className="km-treasure-chip">
                  <span
                    className="km-treasure-code"
                    style={{
                      backgroundColor: row.badgeColor,
                    }}
                  >
                    {row.bomCode}
                  </span>
                  <span className="km-treasure-name">{row.primaryName}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <KidsRunningFooter
          serialCode={dossier.serialCode}
          explorerLabel={kui.explorerLabel}
          explorerName={explorerName}
          pageLabel={kui.pageFooter(pageMode === 'full_8p' ? 5 : 3, totalPages)}
        />
      </article>

      {/* ==================== PAGE 06: 4 SUB-ASSEMBLY LEGO BAGS PHOTO ALBUM (8P MODE) ==================== */}
      {pageMode === 'full_8p' && (
        <article className="monograph-page km-page" data-page="6">
          <KidsRunningHeader
            seriesHeader={kui.seriesHeader}
            bayCode={dossier.bayCode}
            shortTag={dossier.shortTag}
            editionLabel={editionLabel}
          />

          <div className="km-page-body">
            <div className="km-sec-head">
              <span className="km-sec-kicker">
                <Boxes size={12} aria-hidden="true" />
                <span>{kui.p6Kicker}</span>
              </span>
              <h2 className="km-sec-title">{kui.p6Title}</h2>
              <p className="km-sec-sub">{kui.p6Sub}</p>
            </div>

            {/* Plates #9, #10, #11, #12: 2×2 Grid of Isolated Sub-Assembly Studio Macro Photos */}
            <div className="km-bags-grid">
              {dossier.subAssemblyCards.map((bag) => {
                const imgSrc = plates?.[bag.plateKey];
                return (
                  <figure key={bag.groupKey} className="km-bag-card">
                    <div className="km-bag-header">
                      <span
                        className="km-bag-num"
                        style={{ backgroundColor: bag.badgeColor }}
                      >
                        {kui.bagLabel(bag.bagNumber)}
                      </span>
                      <strong className="km-bag-title">{bag.title}</strong>
                      <span className="km-bag-count">
                        {kui.teamPartsUnit(bag.partCount)}
                      </span>
                    </div>

                    <div className="km-bag-photo-box">
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={bag.title}
                          className="km-plate-img"
                        />
                      ) : (
                        <KidsPlatePlaceholder label={bag.title} />
                      )}
                    </div>

                    <figcaption className="km-bag-tags">
                      {bag.partTags.map((pt) => (
                        <span key={pt.bomCode} className="km-mini-pill">
                          <b>{pt.bomCode}</b> {pt.name}
                        </span>
                      ))}
                      {bag.partCount > bag.partTags.length && (
                        <span className="km-mini-pill">
                          +{bag.partCount - bag.partTags.length}
                        </span>
                      )}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </div>

          <KidsRunningFooter
            serialCode={dossier.serialCode}
            explorerLabel={kui.explorerLabel}
            explorerName={explorerName}
            pageLabel={kui.pageFooter(6, totalPages)}
          />
        </article>
      )}

      {/* ==================== PAGE 07 (or P4 in 4P): 4-PANEL 3D ACTION COMIC ==================== */}
      <article
        className="monograph-page km-page"
        data-page={pageMode === 'full_8p' ? '7' : '4'}
      >
        <KidsRunningHeader
          seriesHeader={kui.seriesHeader}
          bayCode={dossier.bayCode}
          shortTag={dossier.shortTag}
          editionLabel={editionLabel}
        />

        <div className="km-page-body">
          <div className="km-sec-head">
            <span className="km-sec-kicker">
              <Zap size={12} aria-hidden="true" />
              <span>{kui.p7Kicker}</span>
            </span>
            <h2 className="km-sec-title">{kui.p7Title}</h2>
            <p className="km-sec-sub">{kui.p7Sub}</p>
          </div>

          {/* Plates #13, #14, #15, #16: 2×2 Slow-Motion 3D Cutaway Comic Panels */}
          <div className="km-comic-grid">
            {dossier.comicFrames.map((cf, idx) => {
              const imgSrc = plates?.[cf.plateKey];
              const tone = FUN_STAT_TONES[idx];
              return (
                <figure key={cf.plateKey} className={`km-comic-panel tone-${tone}`}>
                  <div className="km-comic-top">
                    <span className="km-comic-step">{cf.stepBadge}</span>
                    <strong className="km-comic-title">{cf.title}</strong>
                  </div>
                  <div className="km-comic-img-box">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={cf.title}
                        className="km-plate-img"
                      />
                    ) : (
                      <KidsPlatePlaceholder label={cf.title} />
                    )}
                  </div>
                  <figcaption className="km-comic-caption">
                    {cf.caption}
                  </figcaption>
                </figure>
              );
            })}
          </div>

          {/* In 8-page mode, show visual 1:1 Cartridge/Arrow Cutaway strip; in 4-page mode, show Scan-to-Play QR bar */}
          {pageMode === 'full_8p' ? (
            <section className="km-ammo-visual-strip">
              <div className="km-ammo-diagram-col">
                <CartridgeCutawayDiagram
                  caliber={dossier.caliberProfile}
                  edition={edition}
                  lang={lang}
                />
              </div>
              <div className="km-ammo-stats-col">
                <span className="km-ammo-badge">
                  {kui.ammoStripBadge(dossier.isArchery)}
                </span>
                <strong className="km-ammo-name">
                  {isZh ? cSpec.nameZh : cSpec.nameEn}
                </strong>
                <div className="km-ammo-kv-pills">
                  <div className="km-akv-pill">
                    <span>{kui.statSpeed}</span>
                    <strong>{cSpec.muzzleVelocityMps} m/s</strong>
                  </div>
                  <div className="km-akv-pill">
                    <span>{kui.statEnergy}</span>
                    <strong>{dossier.metrics.muzzleEnergyJ}</strong>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="km-qr-playground-card is-compact">
              <div className="km-qr-box">
                <svg
                  viewBox={`0 0 ${dossier.qrSvg.viewSize} ${dossier.qrSvg.viewSize}`}
                  className="m-qr-svg"
                  shapeRendering="crispEdges"
                  role="img"
                  aria-label={kui.qrTitle}
                >
                  <rect
                    width={dossier.qrSvg.viewSize}
                    height={dossier.qrSvg.viewSize}
                    fill="#ffffff"
                  />
                  <path d={dossier.qrSvg.pathD} fill="#090d14" />
                </svg>
              </div>
              <div className="km-qr-copy">
                <span className="km-qr-badge">
                  <Smartphone size={12} aria-hidden="true" />
                  <span>{kui.qrCertBadge}</span>
                </span>
                <h3 className="km-qr-title">{kui.qrTitle}</h3>
                <p className="km-qr-sub">{kui.qrSub}</p>
              </div>
            </section>
          )}
        </div>

        <KidsRunningFooter
          serialCode={dossier.serialCode}
          explorerLabel={kui.explorerLabel}
          explorerName={explorerName}
          pageLabel={kui.pageFooter(pageMode === 'full_8p' ? 7 : 4, totalPages)}
        />
      </article>

      {/* ==================== PAGE 08: MACRO ZOOM, STEP ORDER CARDS & 3D TOY QR (8P MODE) ==================== */}
      {pageMode === 'full_8p' && (
        <article className="monograph-page km-page" data-page="8">
          <KidsRunningHeader
            seriesHeader={kui.seriesHeader}
            bayCode={dossier.bayCode}
            shortTag={dossier.shortTag}
            editionLabel={editionLabel}
          />

          <div className="km-page-body">
            <div className="km-sec-head">
              <span className="km-sec-kicker">
                <Award size={12} aria-hidden="true" />
                <span>{kui.p8Kicker}</span>
              </span>
              <h2 className="km-sec-title">{kui.p8Title}</h2>
              <p className="km-sec-sub">{kui.p8Sub}</p>
            </div>

            {/* Plate #17: Giant Breech / Core Mechanism X-Ray Macro Zoom */}
            <figure className="km-macro-zoom-card">
              <div className="km-macro-zoom-img">
                {plates?.breech_closeup ? (
                  <img
                    src={plates.breech_closeup}
                    alt={kui.macroZoomBadge}
                    className="km-plate-img"
                  />
                ) : (
                  <KidsPlatePlaceholder label="MACRO CORE ZOOM 3D" />
                )}
              </div>
              <figcaption className="km-turnaround-badge tone-sky">
                <Eye size={13} aria-hidden="true" />
                <strong>{kui.macroZoomBadge}</strong>
              </figcaption>
            </figure>

            {/* Clean Visual Step-by-Step Order Cards (Big Number + Short Title Only!) */}
            <section className="km-steps-section">
              <div className="km-treasure-bar">
                <span>{kui.stepsTitle(dossier.fieldStripRows.length)}</span>
              </div>
              <div className="km-steps-grid">
                {dossier.fieldStripRows.map((row) => (
                  <div key={row.orderLabel} className="km-step-card">
                    <span className="km-step-num">{row.orderLabel}</span>
                    <strong className="km-step-name">{row.title}</strong>
                  </div>
                ))}
              </div>
            </section>

            {/* Scan-to-Play Live 3D Toy Bench + Junior Explorer Seal */}
            <section className="km-qr-playground-card">
              <div className="km-qr-box">
                <svg
                  viewBox={`0 0 ${dossier.qrSvg.viewSize} ${dossier.qrSvg.viewSize}`}
                  className="m-qr-svg"
                  shapeRendering="crispEdges"
                  role="img"
                  aria-label={kui.qrTitle}
                >
                  <rect
                    width={dossier.qrSvg.viewSize}
                    height={dossier.qrSvg.viewSize}
                    fill="#ffffff"
                  />
                  <path d={dossier.qrSvg.pathD} fill="#090d14" />
                </svg>
              </div>
              <div className="km-qr-copy">
                <div className="km-qr-top-row">
                  <span className="km-qr-badge">
                    <Smartphone size={12} aria-hidden="true" />
                    <span>{kui.qrCertBadge}</span>
                  </span>
                  <span className="km-qr-explorer-pill">
                    <Award size={11} aria-hidden="true" />
                    <span>{explorerName}</span>
                  </span>
                </div>
                <h3 className="km-qr-title">{kui.qrTitle}</h3>
                <p className="km-qr-sub">{kui.qrSub}</p>
                <div className="km-qr-url">{dossier.deepLinkUrl}</div>
              </div>
            </section>
          </div>

          <KidsRunningFooter
            serialCode={dossier.serialCode}
            explorerLabel={kui.explorerLabel}
            explorerName={explorerName}
            pageLabel={kui.pageFooter(8, totalPages)}
          />
        </article>
      )}
    </div>
  );
};
