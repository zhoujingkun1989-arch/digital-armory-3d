import React, { useEffect, useId, useState, useSyncExternalStore } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Box,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Flame,
  Maximize2,
  RotateCcw,
  Scissors,
  Table2,
  X,
} from 'lucide-react';
import {
  getCartridgeDossierCollapsed,
  setCartridgeDossierCollapsed,
  subscribeCartridgeDossierCollapsed,
} from '../../engine/actors/CartridgeCutawayStage';
import {
  CARTRIDGE_LAB_ORDER,
  CARTRIDGE_LAB_SPECS,
} from '../../engine/cartridges/cartridgeSpecs';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
import { useAppStore } from '../../store/useAppStore';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';
import { StudioEnvironmentBar } from '../workbench/StudioEnvironmentBar';

const MAX_OAL_MM = 138.43; // .50 BMG reference 100% bar height

export const CartridgeLabView: React.FC = () => {
  const [matrixOpen, setMatrixOpen] = useState(false);
  const dossierCollapsed = useSyncExternalStore(
    subscribeCartridgeDossierCollapsed,
    getCartridgeDossierCollapsed,
    getCartridgeDossierCollapsed
  );
  const explodeSliderId = useId();
  const tableCaptionId = useId();

  useEffect(() => () => setCartridgeDossierCollapsed(false), []);

  const lang = useAppStore((s) => s.lang);
  const activeCaliber = useAppStore((s) => s.activeCartridgeCaliber);
  const lineupOverview = useAppStore((s) => s.cartridgeLineupOverview);
  const cutaway = useAppStore((s) => s.cartridgeSectionCut);
  const explodeProgress = useAppStore((s) => s.cartridgeExplodeProgress);
  const showEdges = useAppStore((s) => s.showEdges);

  const returnToArmory = useAppStore((s) => s.returnToArmory);
  const selectLabCartridge = useAppStore((s) => s.selectLabCartridge);
  const setCartridgeLineupOverview = useAppStore(
    (s) => s.setCartridgeLineupOverview
  );
  const toggleCartridgeSectionCut = useAppStore(
    (s) => s.toggleCartridgeSectionCut
  );
  const setCartridgeExplodeProgress = useAppStore(
    (s) => s.setCartridgeExplodeProgress
  );
  const toggleShowEdges = useAppStore((s) => s.toggleShowEdges);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);

  const ui = UI_STRINGS[lang].cartridgeLab;
  const isZh = lang === 'zh';
  const spec = CARTRIDGE_LAB_SPECS[activeCaliber];
  const primaryWeaponLabel = getLocalizedShortWeaponLabel(
    spec.primaryWeaponId,
    lang
  );

  const tableCssVars = {
    '--col-standard': `"${ui.colStandard}"`,
    '--col-case-oal': `"${ui.colCaseOal}"`,
    '--col-charge': `"${ui.colCharge}"`,
    '--col-projectile': `"${ui.colProjectile}"`,
    '--col-pressure': `"${ui.colPressure}"`,
    '--col-velocity': `"${ui.colVelocity}"`,
    '--col-energy': `"${ui.colEnergy}"`,
    '--col-weapons': `"${ui.colWeapons}"`,
  } as React.CSSProperties;

  return (
    <div className="cartridge-lab-overlay">
      {/* Top Exhibition Header */}
      <header className="cartridge-header">
        <div className="brand-block">
          <button
            type="button"
            className="back-armory-btn"
            onClick={returnToArmory}
            title={ui.backVaultTitle}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>{ui.backVaultBtn}</span>
          </button>

          <div className="brand-badge cartridge-lab-badge">{ui.badge}</div>
          <div>
            <h1 className="brand-title">{ui.title}</h1>
            <p className="brand-sub">{ui.subtitle}</p>
          </div>
        </div>

        <div className="cartridge-header-actions">
          <StudioEnvironmentBar compact />
          <LanguageSwitchPill compact />

          <button
            type="button"
            className={`toggle-chip ${lineupOverview ? 'active-cyan' : ''}`}
            aria-pressed={lineupOverview}
            title={ui.lineupTitle}
            onClick={() => setCartridgeLineupOverview(true)}
          >
            <Maximize2 size={13} aria-hidden="true" />
            <span>{ui.lineupBtn}</span>
          </button>

          <button
            type="button"
            className={`toggle-chip ${!lineupOverview ? 'active-cyan' : ''}`}
            aria-pressed={!lineupOverview}
            title={ui.focusSpecimenTitle}
            onClick={() => setCartridgeLineupOverview(false)}
          >
            <Crosshair size={13} aria-hidden="true" />
            <span>{ui.focusSpecimenBtn}</span>
          </button>

          <button
            type="button"
            className={`toggle-chip ${cutaway ? 'active-teal' : ''}`}
            aria-pressed={cutaway}
            title={ui.cutawayTitle}
            onClick={toggleCartridgeSectionCut}
          >
            <Scissors size={13} aria-hidden="true" />
            <span>{cutaway ? ui.cutawayOn : ui.cutawayOff}</span>
          </button>

          <button
            type="button"
            className={`toggle-chip ${showEdges ? 'active' : ''}`}
            aria-pressed={showEdges}
            title={ui.edgesTitle}
            onClick={toggleShowEdges}
          >
            <Box size={13} aria-hidden="true" />
            <span>{ui.edgesBtn}</span>
          </button>

          <button
            type="button"
            className={`toggle-chip ${matrixOpen ? 'active-amber' : ''}`}
            aria-pressed={matrixOpen}
            title={ui.matrixToggleTitle}
            onClick={() => setMatrixOpen((v) => !v)}
          >
            <Table2 size={13} aria-hidden="true" />
            <span>
              {matrixOpen ? ui.matrixToggleClose : ui.matrixToggleOpen}
            </span>
          </button>
        </div>
      </header>

      {/* Left Curatorial Cartridge Cutaway Dossier Card (Collapsible for Full-Width Panorama) */}
      <aside
        className={`cartridge-dossier-card ${dossierCollapsed ? 'is-collapsed' : ''}`}
      >
        <div className="cartridge-dossier-top">
          <span className="cartridge-dossier-badge">{ui.anatomyCardBadge}</span>
          <div className="cartridge-dossier-top-right">
            {dossierCollapsed && (
              <span className="cartridge-collapsed-caliber">{spec.code}</span>
            )}
            <span className="cartridge-standard-pill">{spec.standard}</span>
            <button
              type="button"
              className="cartridge-dossier-toggle-btn"
              aria-expanded={!dossierCollapsed}
              aria-label={
                dossierCollapsed
                  ? isZh
                    ? '展开弹药工程解剖档案'
                    : 'Expand ammunition dossier'
                  : isZh
                    ? '收起左栏全宽检视'
                    : 'Collapse dossier for full-width view'
              }
              title={
                dossierCollapsed
                  ? isZh
                    ? '展开弹药工程解剖档案'
                    : 'Expand ammunition dossier'
                  : isZh
                    ? '收起左栏全宽检视七弹全景'
                    : 'Collapse dossier for full-width view'
              }
              onClick={() => setCartridgeDossierCollapsed(!dossierCollapsed)}
            >
              {dossierCollapsed ? (
                <ChevronRight size={14} aria-hidden="true" />
              ) : (
                <ChevronLeft size={14} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {!dossierCollapsed && (
          <>
            <h2 className="cartridge-specimen-title">
              {isZh ? spec.nameZh : spec.nameEn}
            </h2>
            <p className="cartridge-specimen-sub">
              {isZh ? spec.loadSubtitleZh : spec.loadSubtitleEn}
            </p>

            {/* 6-Cell Quantitative SAAMI/CIP Metrology Grid */}
            <div className="cartridge-metrics-grid">
              <div className="cartridge-metric-cell">
                <span className="c-metric-label">{ui.dimOalCase}</span>
                <strong className="c-metric-val">
                  {spec.oalMm.toFixed(2)} / {spec.caseLengthMm.toFixed(2)} mm
                </strong>
              </div>
              <div className="cartridge-metric-cell">
                <span className="c-metric-label">{ui.dimRimBullet}</span>
                <strong className="c-metric-val">
                  Ø {spec.bulletDiameterMm.toFixed(2)} /{' '}
                  {spec.rimDiameterMm.toFixed(2)} mm
                </strong>
              </div>
              <div className="cartridge-metric-cell">
                <span className="c-metric-label">{ui.chargeVolumeMass}</span>
                <strong className="c-metric-val">
                  {spec.caseCapacityMl.toFixed(2)} mL ·{' '}
                  {spec.propellantMassG.toFixed(2)} g
                </strong>
              </div>
              <div className="cartridge-metric-cell">
                <span className="c-metric-label">{ui.projectileSpec}</span>
                <strong className="c-metric-val">
                  {spec.projectileMassG.toFixed(2)} g ({spec.projectileGrain}{' '}
                  gr)
                </strong>
              </div>
              <div className="cartridge-metric-cell">
                <span className="c-metric-label">{ui.pressureVelocity}</span>
                <strong className="c-metric-val">
                  {spec.peakPressureMPa} MPa · {spec.muzzleVelocityMps} m/s
                </strong>
              </div>
              <div className="cartridge-metric-cell highlight-energy">
                <span className="c-metric-label">{ui.muzzleEnergy}</span>
                <strong className="c-metric-val">
                  {spec.muzzleEnergyJ.toLocaleString()} J
                </strong>
              </div>
            </div>

            {/* Internal Cutaway Anatomy Breakdown */}
            <div className="cartridge-anatomy-notes">
              <div className="c-note-row">
                <span className="c-note-key">{ui.coreAnatomyLabel}</span>
                <span className="c-note-val">
                  {isZh ? spec.coreAnatomyZh : spec.coreAnatomyEn}
                </span>
              </div>
              <div className="c-note-row">
                <span className="c-note-key">{ui.propellantLabel}</span>
                <span className="c-note-val">
                  {isZh ? spec.propellantTypeZh : spec.propellantTypeEn} (
                  {Math.round(spec.propellantFillRatio * 100)}%)
                </span>
              </div>
              <div className="c-note-row">
                <span className="c-note-key">{ui.primerLabel}</span>
                <span className="c-note-val">
                  {isZh ? spec.primerTypeZh : spec.primerTypeEn}
                </span>
              </div>
            </div>

            <p className="cartridge-highlight-copy">
              {isZh ? spec.highlightZh : spec.highlightEn}
            </p>

            {/* Axial Anatomy Explode Slider */}
            <div className="cartridge-explode-box">
              <div className="cartridge-explode-head">
                <label htmlFor={explodeSliderId}>{ui.explodeLabel}</label>
                <div className="cartridge-explode-right">
                  <span className="cartridge-explode-pct">
                    {Math.round(explodeProgress * 100)}%
                  </span>
                  {explodeProgress > 0.01 && (
                    <button
                      type="button"
                      className="cartridge-explode-reset"
                      onClick={() => setCartridgeExplodeProgress(0)}
                    >
                      <RotateCcw size={10} aria-hidden="true" />
                      <span>{ui.explodeReset}</span>
                    </button>
                  )}
                </div>
              </div>
              <input
                id={explodeSliderId}
                type="range"
                className="cartridge-explode-slider"
                min={0}
                max={1000}
                value={Math.round(explodeProgress * 1000)}
                onChange={(e) =>
                  setCartridgeExplodeProgress(Number(e.target.value) / 1000)
                }
              />
            </div>

            {/* Representative Vault Weapons & Direct Live-Firing Jump */}
            <div className="cartridge-weapon-links">
              <div className="cartridge-weapon-pills">
                {spec.representativeWeapons.map((wId) => (
                  <button
                    key={wId}
                    type="button"
                    className="cartridge-weapon-pill"
                    onClick={() => enterWorkbench(wId, 'firing')}
                  >
                    {getLocalizedShortWeaponLabel(wId, lang)}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="cartridge-chamber-cta"
                onClick={() => enterWorkbench(spec.primaryWeaponId, 'firing')}
              >
                <Flame size={14} aria-hidden="true" />
                <span>{ui.chamberInWeaponBtn(primaryWeaponLabel)}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </aside>

      {/* Quantitative 7-Caliber Responsive Comparison Matrix Panel */}
      {matrixOpen && (
        <section
          className="cartridge-matrix-panel"
          aria-labelledby={tableCaptionId}
        >
          <div className="cartridge-matrix-head">
            <div className="cartridge-matrix-title-wrap">
              <Table2 size={14} aria-hidden="true" />
              <span>{ui.tableCaption}</span>
            </div>
            <button
              type="button"
              className="cartridge-matrix-close"
              aria-label={ui.matrixToggleClose}
              onClick={() => setMatrixOpen(false)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>

          <div
            className="cartridge-table-region"
            role="region"
            aria-labelledby={tableCaptionId}
            tabIndex={0}
            style={tableCssVars}
          >
            <table className="cartridge-comparison-table">
              <caption id={tableCaptionId} className="sr-only">
                {ui.tableCaption}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{ui.colCaliber}</th>
                  <th scope="col">{ui.colStandard}</th>
                  <th scope="col">{ui.colCaseOal}</th>
                  <th scope="col">{ui.colCharge}</th>
                  <th scope="col">{ui.colProjectile}</th>
                  <th scope="col">{ui.colPressure}</th>
                  <th scope="col">{ui.colVelocity}</th>
                  <th scope="col">{ui.colEnergy}</th>
                  <th scope="col">{ui.colWeapons}</th>
                </tr>
              </thead>
              <tbody>
                {CARTRIDGE_LAB_ORDER.map((cal) => {
                  const row = CARTRIDGE_LAB_SPECS[cal];
                  const isSelected = cal === activeCaliber;
                  return (
                    <tr
                      key={cal}
                      className={isSelected ? 'is-active-row' : ''}
                      onClick={() => selectLabCartridge(cal, false)}
                    >
                      <th scope="row">
                        <span className="c-row-code">{row.code}</span>
                      </th>
                      <td data-col="standard">{row.standard}</td>
                      <td data-col="case-oal">
                        {row.caseLengthMm.toFixed(1)} / {row.oalMm.toFixed(1)}
                      </td>
                      <td data-col="charge">
                        {row.caseCapacityMl.toFixed(2)} mL ·{' '}
                        {row.propellantMassG.toFixed(2)} g
                      </td>
                      <td data-col="projectile">
                        {row.projectileMassG.toFixed(2)} g ({row.projectileGrain}{' '}
                        gr)
                      </td>
                      <td data-col="pressure">{row.peakPressureMPa} MPa</td>
                      <td data-col="velocity">{row.muzzleVelocityMps} m/s</td>
                      <td data-col="energy" className="c-energy-td">
                        {row.muzzleEnergyJ.toLocaleString()} J
                      </td>
                      <td data-col="weapons">
                        {row.representativeWeapons
                          .map((wId) => getLocalizedShortWeaponLabel(wId, lang))
                          .join(', ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Bottom 7-Caliber 1:1 Scale Selector Dock */}
      <nav className="cartridge-dock" aria-label={ui.caliberSelectorAria}>
        <div className="cartridge-dock-strip">
          {CARTRIDGE_LAB_ORDER.map((cal) => {
            const item = CARTRIDGE_LAB_SPECS[cal];
            const isSelected = cal === activeCaliber;
            const heightPct = Math.max(
              18,
              Math.round((item.oalMm / MAX_OAL_MM) * 100)
            );
            return (
              <button
                key={cal}
                type="button"
                className={`cartridge-dock-card ${isSelected ? 'active' : ''}`}
                aria-pressed={isSelected}
                onClick={() => selectLabCartridge(cal, !lineupOverview)}
              >
                <div className="c-dock-bar-track" aria-hidden="true">
                  <span
                    className="c-dock-bar-fill"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <div className="c-dock-meta">
                  <span className="c-dock-code">{item.code}</span>
                  <span className="c-dock-dims">
                    {item.oalMm.toFixed(1)} mm ·{' '}
                    {item.muzzleEnergyJ.toLocaleString()} J
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

CartridgeLabView.displayName = 'CartridgeLabView';
export default CartridgeLabView;
