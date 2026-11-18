import React from 'react';
import { UI_STRINGS } from '../../i18n/uiStrings';
import type { MonographDossierData } from './monographDataAssembler';
import type {
  MonographCaptureBundle,
  MonographEdition,
  MonographPageMode,
} from './monographCaptureStore';
import {
  formatMonographDriveSpec,
  getMonographDomainLabels,
  getMonographLocalizedStrings,
} from './monographStrings';
import {
  BallisticsVectorChart,
  CaliberEnergyLadder,
  CartridgeCutawayDiagram,
  ExplodedPlateVectorOverlay,
} from './MonographVectorCharts';

export interface MonographDocumentProps {
  dossier: MonographDossierData;
  captureBundle: MonographCaptureBundle | null;
  edition: MonographEdition;
  pageMode: MonographPageMode;
  collectorCallsign: string;
}

const PageRunningHeader: React.FC<{
  seriesHeader: string;
  bayCode: string;
  modelCode: string;
  editionStamp: string;
}> = ({ seriesHeader, bayCode, modelCode, editionStamp }) => (
  <header className="m-page-header">
    <div className="m-ph-left">
      <span className="m-ph-bay">{bayCode}</span>
      <span className="m-ph-series">{seriesHeader}</span>
    </div>
    <div className="m-ph-right">
      <span className="m-ph-model">{modelCode}</span>
      <span className="m-ph-stamp">{editionStamp}</span>
    </div>
  </header>
);

const PageIsoFooter: React.FC<{
  serialCode: string;
  collectorLabel: string;
  scaleTag: string;
  pageLabel: string;
}> = ({ serialCode, collectorLabel, scaleTag, pageLabel }) => (
  <footer className="m-page-footer">
    <div className="m-pf-cell">
      <span className="m-pf-mono">{serialCode}</span>
    </div>
    <div className="m-pf-cell m-pf-center">
      <span>{collectorLabel}</span>
      <span className="m-pf-dot">·</span>
      <span>{scaleTag}</span>
    </div>
    <div className="m-pf-cell m-pf-right">
      <span className="m-pf-page-num">{pageLabel}</span>
    </div>
  </footer>
);

const PlatePlaceholder: React.FC<{ label: string }> = ({ label }) => (
  <div className="m-plate-placeholder">
    <div className="m-plate-spinner" />
    <span>{label}</span>
  </div>
);

export const MonographDocument: React.FC<MonographDocumentProps> = ({
  dossier,
  captureBundle,
  edition,
  pageMode,
  collectorCallsign,
}) => {
  const { lang } = dossier;
  const isZh = lang === 'zh';
  const ui = UI_STRINGS[lang].monograph;
  const armoryUi = UI_STRINGS[lang].armory;
  const domain = getMonographDomainLabels(lang, dossier.isArchery);
  const mStrings = getMonographLocalizedStrings(lang);

  const editionStamp =
    edition === 'blueprint_manual'
      ? ui.editionStampBlueprint
      : ui.editionStampObsidian;

  const resolvedCollector =
    collectorCallsign.trim() || ui.coverDefaultCollector;

  const totalPages = pageMode === 'full_8p' ? 8 : 4;
  const plates = captureBundle?.plates ?? null;
  const explodedPins = captureBundle?.explodedPins ?? [];

  const act1 = dossier.acts[0];
  const act2 = dossier.acts[1];
  const act3 = dossier.acts[2];
  const act4 = dossier.acts[3];

  const cSpec = dossier.cartridgeSpec;

  return (
    <div
      className={`monograph-document edition-${edition}`}
      data-edition={edition}
    >
      {/* ==================== PAGE 01: FRONT COVER POSTER ==================== */}
      <article className="monograph-page m-cover-page" data-page="1">
        <PageRunningHeader
          seriesHeader={ui.seriesHeader}
          bayCode={`VOL.${String(dossier.volumeIndex).padStart(2, '0')} · ${dossier.bayCode}`}
          modelCode={dossier.caliberLabel}
          editionStamp={editionStamp}
        />

        <div className="m-cover-body">
          <div className="m-cover-kicker-row">
            <span className="m-cover-tag">{domain.coverMonographTag}</span>
            <span className="m-cover-origin">{dossier.originTag}</span>
          </div>

          <h1 className="m-cover-title">{dossier.name}</h1>
          <div className="m-cover-model-code">{dossier.modelCode}</div>

          <div className="m-cover-mechanism-banner">
            <span className="m-mech-k">{domain.mechanismLabel}</span>
            <span className="m-mech-v">{dossier.actionMechanism}</span>
          </div>

          {/* Plate #1: 3/4 Studio Hero Photograph */}
          <figure className="m-cover-hero-frame">
            {plates?.cover_hero ? (
              <img
                src={plates.cover_hero}
                alt={dossier.name}
                className="m-plate-img"
              />
            ) : (
              <PlatePlaceholder
                label={mStrings.placeholders.hero(dossier.shortTag)}
              />
            )}
            <div className="m-hero-corner-tl" />
            <div className="m-hero-corner-tr" />
            <div className="m-hero-corner-bl" />
            <div className="m-hero-corner-br" />
            <figcaption className="m-cover-hero-badge">
              <span>{dossier.shortTag}</span>
              <span>·</span>
              <span>
                {armoryUi.precisionValue(4, dossier.bomRows.length)}
              </span>
              <span>·</span>
              <span>2K 5-CH ORM PBR</span>
            </figcaption>
          </figure>

          <p className="m-cover-deck">{dossier.description}</p>

          {/* 6-Cell 1:1 Factory Metrology Bar */}
          <div className="m-cover-specs-grid">
            <div className="m-spec-box">
              <span className="m-sk">{domain.oalLabel}</span>
              <strong className="m-sv">{dossier.metrics.oal}</strong>
            </div>
            <div className="m-spec-box">
              <span className="m-sk">{domain.barrelLabel}</span>
              <strong className="m-sv">{dossier.metrics.barrel}</strong>
            </div>
            <div className="m-spec-box">
              <span className="m-sk">{domain.weightLabel}</span>
              <strong className="m-sv">{dossier.metrics.weight}</strong>
            </div>
            <div className="m-spec-box">
              <span className="m-sk">{domain.muzzleVelLabel}</span>
              <strong className="m-sv">{dossier.metrics.muzzleVelocity}</strong>
            </div>
            <div className="m-spec-box">
              <span className="m-sk">{domain.rangeLabel}</span>
              <strong className="m-sv">{dossier.metrics.effectiveRange}</strong>
            </div>
            <div className="m-spec-box is-accent">
              <span className="m-sk">{domain.muzzleEnergy}</span>
              <strong className="m-sv">{dossier.metrics.muzzleEnergyJ}</strong>
            </div>
          </div>

          {/* ISO 7200 Engineering Title Block & Collector Serial Stamp */}
          <div className="m-iso-title-block">
            <div className="m-iso-col">
              <span className="m-iso-label">{ui.coverHighlightsHeading}</span>
              <div className="m-cover-chips">
                {dossier.highlights.map((h) => (
                  <span key={h} className="m-cover-chip">
                    {h}
                  </span>
                ))}
              </div>
            </div>
            <div className="m-iso-stamp-box">
              <span className="m-iso-label">{ui.coverCollectorLabel}</span>
              <strong className="m-iso-callsign">{resolvedCollector}</strong>
              <span className="m-iso-serial">{dossier.serialCode}</span>
            </div>
          </div>
        </div>

        <PageIsoFooter
          serialCode={dossier.serialCode}
          collectorLabel={resolvedCollector}
          scaleTag={ui.coverScaleTag}
          pageLabel={ui.footerPage(1, totalPages)}
        />
      </article>

      {/* ==================== PAGE 02 & 03: R&D CHRONICLE & BREAKTHROUGHS (8P MODE) ==================== */}
      {pageMode === 'full_8p' && (
        <>
          <article className="monograph-page" data-page="2">
            <PageRunningHeader
              seriesHeader={ui.seriesHeader}
              bayCode={dossier.bayCode}
              modelCode={dossier.modelCode}
              editionStamp={editionStamp}
            />

            <div className="m-page-content">
              <div className="m-chapter-head">
                <span className="m-chapter-kicker">{ui.secChronicleI}</span>
                <h2 className="m-chapter-title">{dossier.headline}</h2>
                <p className="m-chapter-deck">{dossier.deck}</p>
              </div>

              <div className="m-two-col-acts">
                {[act1, act2].filter(Boolean).map((act) => (
                  <section key={act.id} className="m-act-block">
                    <div className="m-act-meta">
                      <span className="m-act-num">{act.actNumber}</span>
                      <span className="m-act-era">{act.eraTag}</span>
                    </div>
                    <h3 className="m-act-title">{act.title}</h3>
                    <div className="m-act-paras">
                      {act.paragraphs.map((p, i) => (
                        <p key={i} className={i === 0 ? 'm-dropcap-p' : ''}>
                          {p}
                        </p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <section className="m-milestones-box">
                <div className="m-subsec-bar">
                  <span>{ui.secMilestonesHeading}</span>
                </div>
                <div className="m-milestones-grid">
                  {dossier.milestones.slice(0, 6).map((ms, idx) => (
                    <div key={`${ms.year}-${idx}`} className="m-ms-card">
                      <div className="m-ms-top">
                        <span className="m-ms-year">{ms.year}</span>
                        <strong className="m-ms-title">{ms.title}</strong>
                      </div>
                      <p className="m-ms-detail">{ms.detail}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <PageIsoFooter
              serialCode={dossier.serialCode}
              collectorLabel={resolvedCollector}
              scaleTag={ui.coverScaleTag}
              pageLabel={ui.footerPage(2, totalPages)}
            />
          </article>

          <article className="monograph-page" data-page="3">
            <PageRunningHeader
              seriesHeader={ui.seriesHeader}
              bayCode={dossier.bayCode}
              modelCode={dossier.modelCode}
              editionStamp={editionStamp}
            />

            <div className="m-page-content">
              <div className="m-chapter-head compact">
                <span className="m-chapter-kicker">{ui.secChronicleII}</span>
                <p className="m-chapter-sub">{ui.secChronicleIISub}</p>
              </div>

              {/* Plate #2: Breech / Core Mechanism X-Ray Macro */}
              <figure className="m-wide-plate-card">
                <div className="m-wide-plate-crop">
                  {plates?.breech_closeup ? (
                    <img
                      src={plates.breech_closeup}
                      alt={domain.plateBreechCaption}
                      className="m-plate-img"
                    />
                  ) : (
                    <PlatePlaceholder
                      label={mStrings.placeholders.breech(
                        dossier.shortTag,
                        dossier.isArchery
                      )}
                    />
                  )}
                </div>
                <figcaption className="m-plate-caption">
                  {domain.plateBreechCaption}
                </figcaption>
              </figure>

              <div className="m-two-col-acts compact-acts">
                {[act3, act4].filter(Boolean).map((act) => (
                  <section key={act.id} className="m-act-block">
                    <div className="m-act-meta">
                      <span className="m-act-num">{act.actNumber}</span>
                      <span className="m-act-era">{act.eraTag}</span>
                    </div>
                    <h3 className="m-act-title">{act.title}</h3>
                    <div className="m-act-paras">
                      {act.paragraphs.slice(0, 2).map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <section className="m-breakthroughs-box">
                <div className="m-subsec-bar">
                  <span>{ui.secBreakthroughsHeading}</span>
                </div>
                <div className="m-bt-grid">
                  {dossier.breakthroughs.slice(0, 3).map((bt) => (
                    <div key={bt.id} className="m-bt-card">
                      <span className="m-bt-tag">{bt.tag}</span>
                      <h4 className="m-bt-title">{bt.title}</h4>
                      <p className="m-bt-desc">{bt.summary}</p>
                      <div className="m-bt-focus">
                        <span>
                          {mStrings.focusPrefix}
                          {bt.focusPartLabel}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <PageIsoFooter
              serialCode={dossier.serialCode}
              collectorLabel={resolvedCollector}
              scaleTag={ui.coverScaleTag}
              pageLabel={ui.footerPage(3, totalPages)}
            />
          </article>
        </>
      )}

      {/* ==================== PAGE 04 (or P2 in 4P): STENCIL CUTAWAY & 6-ROLE ANATOMY ==================== */}
      <article
        className="monograph-page"
        data-page={pageMode === 'full_8p' ? '4' : '2'}
      >
        <PageRunningHeader
          seriesHeader={ui.seriesHeader}
          bayCode={dossier.bayCode}
          modelCode={dossier.modelCode}
          editionStamp={editionStamp}
        />

        <div className="m-page-content">
          <div className="m-chapter-head compact">
            <span className="m-chapter-kicker">{ui.secCutawayRoles}</span>
            <p className="m-chapter-sub">{ui.secCutawayRolesSub}</p>
          </div>

          <div className="m-dual-plates-row">
            <figure className="m-half-plate-card">
              <div className="m-half-plate-box">
                {plates?.stencil_cutaway ? (
                  <img
                    src={plates.stencil_cutaway}
                    alt={domain.plateStencilCaption}
                    className="m-plate-img"
                  />
                ) : (
                  <PlatePlaceholder
                    label={mStrings.placeholders.stencilCutaway}
                  />
                )}
              </div>
              <figcaption className="m-plate-caption">
                {domain.plateStencilCaption}
              </figcaption>
            </figure>

            <figure className="m-half-plate-card">
              <div className="m-half-plate-box">
                {plates?.functional_roles ? (
                  <img
                    src={plates.functional_roles}
                    alt={domain.plateRolesCaption}
                    className="m-plate-img"
                  />
                ) : (
                  <PlatePlaceholder
                    label={mStrings.placeholders.functionalRoles}
                  />
                )}
              </div>
              <figcaption className="m-plate-caption">
                {domain.plateRolesCaption}
              </figcaption>
            </figure>
          </div>

          {/* 6-Role Subsystem Classification Matrix */}
          <div className="m-roles-grid">
            {dossier.roleSummaries.map((r) => (
              <div key={r.role} className="m-role-card">
                <div className="m-role-head">
                  <span
                    className="m-role-swatch"
                    style={{ backgroundColor: r.colorHex }}
                  />
                  <strong className="m-role-name">{r.label}</strong>
                  <span className="m-role-count">{r.parts.length}</span>
                </div>
                <p className="m-role-desc">{r.desc}</p>
                <div className="m-role-parts">
                  {r.parts.slice(0, 6).map((pt) => (
                    <span key={pt.bomCode} className="m-role-pill">
                      <b>{pt.bomCode}</b> {pt.name}
                    </span>
                  ))}
                  {r.parts.length > 6 && (
                    <span className="m-role-pill">+{r.parts.length - 6}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 7-Phase Operating Kinematic Sequence */}
          <section className="m-cycle7-section">
            <div className="m-subsec-bar">
              <span>{ui.secCycle7Heading}</span>
            </div>
            <div className="m-cycle7-grid">
              {dossier.firingPhases.map((ph) => (
                <div key={ph.stepNum} className="m-phase-cell">
                  <div className="m-phase-top">
                    <span className="m-phase-num">{ph.stepNum}</span>
                    <strong className="m-phase-short">{ph.shortLabel}</strong>
                  </div>
                  <p className="m-phase-desc">{ph.description}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <PageIsoFooter
          serialCode={dossier.serialCode}
          collectorLabel={resolvedCollector}
          scaleTag={ui.coverScaleTag}
          pageLabel={ui.footerPage(pageMode === 'full_8p' ? 4 : 2, totalPages)}
        />
      </article>

      {/* ==================== PAGE 05 (or P3 in 4P): 100% EXPLODED VECTOR BLUEPRINT ==================== */}
      <article
        className="monograph-page"
        data-page={pageMode === 'full_8p' ? '5' : '3'}
      >
        <PageRunningHeader
          seriesHeader={ui.seriesHeader}
          bayCode={dossier.bayCode}
          modelCode={dossier.modelCode}
          editionStamp={editionStamp}
        />

        <div className="m-page-content">
          <div className="m-chapter-head compact">
            <span className="m-chapter-kicker">{ui.secExplodedPlate}</span>
            <p className="m-chapter-sub">{ui.secExplodedPlateSub}</p>
          </div>

          {/* Full 1440×900 Exploded 3D Render + Infinite-DPI Vector Pin Overlay (1920×1200 viewBox) */}
          <figure className="m-exploded-poster-frame">
            <div className="m-exploded-stage">
              {plates?.exploded_bom ? (
                <>
                  <img
                    src={plates.exploded_bom}
                    alt={mStrings.explodedAlt(dossier.name)}
                    className="m-plate-img"
                  />
                  <ExplodedPlateVectorOverlay
                    pins={explodedPins}
                    edition={edition}
                  />
                </>
              ) : (
                <PlatePlaceholder
                  label={mStrings.placeholders.explodedCad(dossier.shortTag)}
                />
              )}
            </div>
            <figcaption className="m-plate-caption">
              {domain.explodedLegendNote}
            </figcaption>
          </figure>

          {/* Compact Complete Part Index Grid right under the poster so the page stands alone as a wall print */}
          <div className="m-poster-index-grid">
            {dossier.bomRows.map((row) => (
              <div key={row.partId} className="m-poster-idx-item">
                <span
                  className="m-poster-idx-code"
                  style={{ borderColor: row.badgeColor, color: row.badgeColor }}
                >
                  {row.bomCode}
                </span>
                <span className="m-poster-idx-name">{row.primaryName}</span>
                <span className="m-poster-idx-env">{row.envelopeMm}</span>
              </div>
            ))}
          </div>
        </div>

        <PageIsoFooter
          serialCode={dossier.serialCode}
          collectorLabel={resolvedCollector}
          scaleTag={ui.coverScaleTag}
          pageLabel={ui.footerPage(pageMode === 'full_8p' ? 5 : 3, totalPages)}
        />
      </article>

      {/* ==================== PAGE 06 & 07: FULL BOM LEDGER & BALLISTICS (8P MODE) ==================== */}
      {pageMode === 'full_8p' && (
        <>
          <article className="monograph-page" data-page="6">
            <PageRunningHeader
              seriesHeader={ui.seriesHeader}
              bayCode={dossier.bayCode}
              modelCode={dossier.modelCode}
              editionStamp={editionStamp}
            />

            <div className="m-page-content is-bom-page">
              <div className="m-chapter-head compact">
                <span className="m-chapter-kicker">{ui.secBomLedger}</span>
                <p className="m-chapter-sub">
                  {ui.secBomLedgerSub(
                    dossier.bomRows.length,
                    dossier.totalTrianglesFormatted
                  )}
                </p>
              </div>

              <table
                className={`m-bom-table ${
                  dossier.bomRows.length >= 26 ? 'is-dense' : ''
                }`}
              >
                <thead>
                  <tr>
                    <th scope="col" className="col-code">
                      {ui.bomColCode}
                    </th>
                    <th scope="col" className="col-comp">
                      {ui.bomColComponent}
                    </th>
                    <th scope="col" className="col-mat">
                      {domain.bomColMaterial}
                    </th>
                    <th scope="col" className="col-env">
                      {ui.bomColEnvelope}
                    </th>
                    <th scope="col" className="col-prin">
                      {ui.bomColPrinciple}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.bomRows.map((row) => (
                    <tr key={row.partId}>
                      <td className="td-code">
                        <span
                          className="m-bom-badge"
                          style={{
                            borderColor: row.badgeColor,
                            color: row.badgeColor,
                          }}
                        >
                          {row.bomCode}
                        </span>
                      </td>
                      <td className="td-comp">
                        <strong>{row.primaryName}</strong>
                        <span>{row.secondaryName}</span>
                      </td>
                      <td className="td-mat">{row.materialLabel}</td>
                      <td className="td-env">{row.envelopeMm}</td>
                      <td className="td-prin">
                        <span className="m-bom-prin-clamp">
                          {row.principleText}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <section
                className="m-bom-signoff-block"
                aria-label={
                  isZh
                    ? 'CAD 几何测绘与运动学质量签审栏'
                    : 'CAD Metrology & Quality Sign-Off'
                }
              >
                <div className="m-bso-main">
                  <span className="m-bso-kicker">
                    {isZh
                      ? 'ISO 128 / 7200 · CAD 几何测绘与运动学质量签审栏'
                      : 'ISO 128 / 7200 · CAD METROLOGY & QUALITY SIGN-OFF'}
                  </span>
                  <strong className="m-bso-spec">
                    {isZh
                      ? '1:1 比例 = 10 mm/单位 · 水密流形 CSG 网格 · 零干涉运动学已核验'
                      : '1:1 Scale = 10 mm/unit · Watertight Manifold CSG · Zero-Interference Kinematics Verified'}
                  </strong>
                </div>
                <div className="m-bso-cells">
                  <div className="m-bso-cell">
                    <span>{isZh ? '坐标基准' : 'CAD DATUM'}</span>
                    <strong>+X · +Y · +Z (mm)</strong>
                  </div>
                  <div className="m-bso-cell">
                    <span>{isZh ? '流形网格' : 'CSG MESH'}</span>
                    <strong>
                      {dossier.bomRows.length} {isZh ? '件' : 'pcs'} ·{' '}
                      {dossier.totalTrianglesFormatted} Δ
                    </strong>
                  </div>
                  <div className="m-bso-cell is-verified">
                    <span>{isZh ? '签审状态' : 'QA SIGN-OFF'}</span>
                    <strong>
                      {isZh ? '已核准 · REV.26' : 'VERIFIED · REV.26'}
                    </strong>
                  </div>
                </div>
              </section>
            </div>

            <PageIsoFooter
              serialCode={dossier.serialCode}
              collectorLabel={resolvedCollector}
              scaleTag={ui.coverScaleTag}
              pageLabel={ui.footerPage(6, totalPages)}
            />
          </article>

          <article className="monograph-page" data-page="7">
            <PageRunningHeader
              seriesHeader={ui.seriesHeader}
              bayCode={dossier.bayCode}
              modelCode={dossier.modelCode}
              editionStamp={editionStamp}
            />

            <div className="m-page-content">
              <div className="m-chapter-head compact">
                <span className="m-chapter-kicker">{domain.secBallistics}</span>
                <p className="m-chapter-sub">{domain.secBallisticsSub}</p>
              </div>

              {/* Vector Chamber Pressure / Draw Force & Velocity Plot */}
              <section className="m-chart-panel">
                <div className="m-subsec-bar">
                  <span>{domain.chartPressureTitle}</span>
                </div>
                <BallisticsVectorChart
                  weaponId={dossier.weaponId}
                  caliber={dossier.caliberProfile}
                  edition={edition}
                  lang={lang}
                />
              </section>

              {/* Split Row: 1:1 Projectile Half-Section Vector Schematic + Quantitative Anatomy Specs */}
              <div className="m-cartridge-split">
                <div className="m-cartridge-diagram-card">
                  <div className="m-subsec-bar">
                    <span>{domain.chartCartridgeTitle}</span>
                  </div>
                  <CartridgeCutawayDiagram
                    caliber={dossier.caliberProfile}
                    edition={edition}
                    lang={lang}
                  />
                </div>

                <div className="m-cartridge-meta-col">
                  <div className="m-cmeta-box">
                    <div className="m-cmeta-title">
                      {isZh ? cSpec.nameZh : cSpec.nameEn}
                    </div>
                    <div className="m-cmeta-sub">
                      {isZh ? cSpec.loadSubtitleZh : cSpec.loadSubtitleEn}
                    </div>
                    <div className="m-cmeta-kv-list">
                      <div>
                        <span>{domain.coreAnatomyLabel}</span>
                        <strong>
                          {isZh ? cSpec.coreAnatomyZh : cSpec.coreAnatomyEn}
                        </strong>
                      </div>
                      <div>
                        <span>{domain.propellantLabel}</span>
                        <strong>
                          {formatMonographDriveSpec(
                            cSpec,
                            dossier.isArchery,
                            lang
                          )}
                        </strong>
                      </div>
                      <div>
                        <span>{domain.primerLabel}</span>
                        <strong>
                          {isZh ? cSpec.primerTypeZh : cSpec.primerTypeEn}
                        </strong>
                      </div>
                    </div>
                    <p className="m-cmeta-note">
                      {isZh ? cSpec.highlightZh : cSpec.highlightEn}
                    </p>
                  </div>

                  <div className="m-cmeta-box">
                    <div className="m-subsec-bar">
                      <span>{domain.energyLadderTitle}</span>
                    </div>
                    <CaliberEnergyLadder
                      activeCaliber={dossier.caliberProfile}
                      lang={lang}
                    />
                  </div>
                </div>
              </div>
            </div>

            <PageIsoFooter
              serialCode={dossier.serialCode}
              collectorLabel={resolvedCollector}
              scaleTag={ui.coverScaleTag}
              pageLabel={ui.footerPage(7, totalPages)}
            />
          </article>
        </>
      )}

      {/* ==================== PAGE 08 (or P4 in 4P): FIELD-STRIP DAG, STOPPAGES & QR SEAL ==================== */}
      <article className="monograph-page" data-page={String(totalPages)}>
        <PageRunningHeader
          seriesHeader={ui.seriesHeader}
          bayCode={dossier.bayCode}
          modelCode={dossier.modelCode}
          editionStamp={editionStamp}
        />

        <div className="m-page-content">
          <div className="m-chapter-head compact">
            <span className="m-chapter-kicker">{domain.secArmorerManual}</span>
            <p className="m-chapter-sub">{domain.secArmorerManualSub}</p>
          </div>

          {/* In 4-page compact mode, include compact curve right at the top of Page 4 */}
          {pageMode === 'compact_4p' && (
            <section className="m-chart-panel compact-chart">
              <div className="m-subsec-bar">
                <span>{domain.chartPressureTitle}</span>
              </div>
              <BallisticsVectorChart
                weaponId={dossier.weaponId}
                caliber={dossier.caliberProfile}
                edition={edition}
                lang={lang}
              />
            </section>
          )}

          {/* Directed Field-Strip Sequence */}
          <section className="m-fieldstrip-section">
            <div className="m-subsec-bar">
              <span>
                {domain.fieldStripHeading} · {dossier.fieldStripManualTitle}
              </span>
            </div>
            <div className="m-fs-grid">
              {dossier.fieldStripRows.map((row) => (
                <div key={row.orderLabel} className="m-fs-card">
                  <div className="m-fs-top">
                    <span className="m-fs-step">{row.orderLabel}</span>
                    <strong className="m-fs-title">{row.title}</strong>
                  </div>
                  <p className="m-fs-hint">{row.actionHint}</p>
                  {row.interferenceNote && pageMode === 'full_8p' && (
                    <div className="m-fs-warn">
                      <b>{ui.interferencePrefix}</b>
                      <span>{row.interferenceNote}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 4 Stoppage & Safety Diagnostics Cards (shown in full_8p mode) */}
          {pageMode === 'full_8p' && (
            <section className="m-malf-section">
              <div className="m-subsec-bar">
                <span>{domain.malfunctionsHeading}</span>
              </div>
              <div className="m-malf-grid">
                {dossier.malfunctionCards.map((mc) => (
                  <div key={mc.code} className="m-malf-card">
                    <div className="m-malf-head">
                      <span className="m-malf-code">{mc.code}</span>
                      <strong className="m-malf-title">{mc.title}</strong>
                    </div>
                    <p className="m-malf-cause">{mc.rootCause}</p>
                    <div className="m-malf-drill">{mc.drillSummary}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Collector Authentication Seal + Vector QR Code */}
          <section className="m-back-seal-card">
            <div className="m-qr-frame">
              <svg
                viewBox={`0 0 ${dossier.qrSvg.viewSize} ${dossier.qrSvg.viewSize}`}
                className="m-qr-svg"
                shapeRendering="crispEdges"
                role="img"
                aria-label={ui.backQrTitle}
              >
                <rect
                  width={dossier.qrSvg.viewSize}
                  height={dossier.qrSvg.viewSize}
                  fill="#ffffff"
                />
                <path d={dossier.qrSvg.pathD} fill="#0b1017" />
              </svg>
            </div>

            <div className="m-seal-copy">
              <div className="m-seal-top">
                <span className="m-seal-badge">{ui.backSealBadge}</span>
                <span className="m-seal-serial">{dossier.serialCode}</span>
              </div>
              <h3 className="m-seal-title">{ui.backQrTitle}</h3>
              <p className="m-seal-sub">{ui.backQrSub}</p>
              <div className="m-seal-url">{dossier.deepLinkUrl}</div>
              <p className="m-seal-colophon">{ui.backColophon}</p>
            </div>
          </section>
        </div>

        <PageIsoFooter
          serialCode={dossier.serialCode}
          collectorLabel={resolvedCollector}
          scaleTag={ui.coverScaleTag}
          pageLabel={ui.footerPage(totalPages, totalPages)}
        />
      </article>
    </div>
  );
};
