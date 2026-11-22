import React, { useEffect, useId, useState, useSyncExternalStore } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Box,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Flame,
  Maximize2,
  RotateCcw,
  Scissors,
  Shield,
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
  isTankOrdnanceProfile,
  TANK_ORDNANCE_ORDER,
} from '../../engine/cartridges/cartridgeSpecs';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
import { useAppStore } from '../../store/useAppStore';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';
import { StudioEnvironmentBar } from '../workbench/StudioEnvironmentBar';

const MAX_SMALL_ARMS_OAL_MM = 138.43; // .50 BMG reference 100% bar height
const MAX_TANK_ORDNANCE_OAL_MM = 984.0; // 120×570mm NATO APFSDS reference 100% bar height

function formatOrdnanceEnergy(energyJ: number): string {
  if (energyJ >= 1_000_000) {
    return `${(energyJ / 1_000_000).toFixed(2)} MJ`;
  }
  return `${energyJ.toLocaleString()} J`;
}

function formatOrdnanceMass(grams: number): string {
  if (grams >= 1000) {
    return `${(grams / 1000).toFixed(2)} kg`;
  }
  return `${grams.toFixed(2)} g`;
}

function formatOrdnanceVolume(ml: number): string {
  if (ml >= 1000) {
    return `${(ml / 1000).toFixed(2)} L`;
  }
  return `${ml.toFixed(2)} mL`;
}

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
  const openExternalBallistics = useAppStore((s) => s.openExternalBallistics);

  const ui = UI_STRINGS[lang].cartridgeLab;
  const isZh = lang === 'zh';
  const isTankGallery = isTankOrdnanceProfile(activeCaliber);
  const activeOrder = isTankGallery ? TANK_ORDNANCE_ORDER : CARTRIDGE_LAB_ORDER;
  const maxOalMm = isTankGallery
    ? MAX_TANK_ORDNANCE_OAL_MM
    : MAX_SMALL_ARMS_OAL_MM;
  const caliberCount = activeOrder.length;
  const isMultiRowDock = caliberCount > 7;
  const zhCaliberCountWord =
    caliberCount === 15
      ? '十五'
      : caliberCount === 11
        ? '十一'
        : caliberCount === 10
          ? '十'
          : caliberCount === 7
            ? '七'
            : caliberCount === 3
              ? '三'
              : String(caliberCount);
  const spec = CARTRIDGE_LAB_SPECS[activeCaliber];
  const primaryWeaponLabel = getLocalizedShortWeaponLabel(
    spec.primaryWeaponId,
    lang
  );

  const handleSwitchGallery = (mode: 'small_arms' | 'tank_ordnance') => {
    if (mode === 'tank_ordnance') {
      if (!isTankGallery) {
        selectLabCartridge('125mm_apfsds', false);
        setCartridgeLineupOverview(true);
      }
    } else if (isTankGallery) {
      selectLabCartridge('556_nato', false);
      setCartridgeLineupOverview(true);
    }
  };

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

          <div
            className={`brand-badge cartridge-lab-badge ${
              isTankGallery ? 'is-armor-badge' : ''
            }`}
          >
            {isTankGallery ? ui.tankOrdnanceBadge : ui.badge}
          </div>
          <div>
            <h1 className="brand-title">
              {isTankGallery ? ui.tankOrdnanceTitle : ui.title}
            </h1>
            <p className="brand-sub">
              {isTankGallery ? ui.tankOrdnanceSubtitle : ui.subtitle}
            </p>
          </div>
        </div>

        <div className="cartridge-header-actions">
          <div
            className="cartridge-gallery-switcher"
            role="group"
            aria-label={ui.gallerySwitchAria}
          >
            <button
              type="button"
              className={`toggle-chip ${!isTankGallery ? 'active-cyan' : ''}`}
              aria-pressed={!isTankGallery}
              title={ui.gallerySmallArmsTitle}
              onClick={() => handleSwitchGallery('small_arms')}
            >
              <span>{ui.gallerySmallArmsBtn}</span>
            </button>
            <button
              type="button"
              className={`toggle-chip is-armor-switch ${
                isTankGallery ? 'active-amber' : ''
              }`}
              aria-pressed={isTankGallery}
              title={ui.galleryTankOrdnanceTitle}
              onClick={() => handleSwitchGallery('tank_ordnance')}
            >
              <Shield size={12} aria-hidden="true" />
              <span>{ui.galleryTankOrdnanceBtn}</span>
            </button>
          </div>

          <StudioEnvironmentBar compact />
          <LanguageSwitchPill compact />

          <button
            type="button"
            className={`toggle-chip ${lineupOverview ? 'active-cyan' : ''}`}
            aria-pressed={lineupOverview}
            title={isTankGallery ? ui.tankLineupTitle : ui.lineupTitle}
            onClick={() => setCartridgeLineupOverview(true)}
          >
            <Maximize2 size={13} aria-hidden="true" />
            <span>{isTankGallery ? ui.tankLineupBtn : ui.lineupBtn}</span>
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
            className="toggle-chip active-cyan"
            title={ui.ballisticsRangeTitle}
            onClick={() => openExternalBallistics(activeCaliber)}
          >
            <Compass size={13} aria-hidden="true" />
            <span>{ui.ballisticsRangeBtn}</span>
          </button>

          <button
            type="button"
            className={`toggle-chip ${matrixOpen ? 'active-amber' : ''}`}
            aria-pressed={matrixOpen}
            title={
              isTankGallery ? ui.tankMatrixToggleTitle : ui.matrixToggleTitle
            }
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
                    ? `收起左栏全宽检视${zhCaliberCountWord}弹全景`
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
                  {formatOrdnanceVolume(spec.caseCapacityMl)} ·{' '}
                  {formatOrdnanceMass(spec.propellantMassG)}
                </strong>
              </div>
              <div className="cartridge-metric-cell">
                <span className="c-metric-label">{ui.projectileSpec}</span>
                <strong className="c-metric-val">
                  {formatOrdnanceMass(spec.projectileMassG)}
                  {!isTankGallery && ` (${spec.projectileGrain} gr)`}
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
                  {formatOrdnanceEnergy(spec.muzzleEnergyJ)}
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
                className="cartridge-ballistics-cta"
                title={ui.ballisticsRangeTitle}
                onClick={() => openExternalBallistics(activeCaliber)}
              >
                <Compass size={14} aria-hidden="true" />
                <span>{ui.ballisticsRangeBtn}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>

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
              <span>
                {isTankGallery ? ui.tankTableCaption : ui.tableCaption}
              </span>
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
                {isTankGallery ? ui.tankTableCaption : ui.tableCaption}
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
                {activeOrder.map((cal) => {
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
                        {formatOrdnanceVolume(row.caseCapacityMl)} ·{' '}
                        {formatOrdnanceMass(row.propellantMassG)}
                      </td>
                      <td data-col="projectile">
                        {formatOrdnanceMass(row.projectileMassG)}
                        {!isTankGallery && ` (${row.projectileGrain} gr)`}
                      </td>
                      <td data-col="pressure">{row.peakPressureMPa} MPa</td>
                      <td data-col="velocity">{row.muzzleVelocityMps} m/s</td>
                      <td data-col="energy" className="c-energy-td">
                        {formatOrdnanceEnergy(row.muzzleEnergyJ)}
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

      {/* Bottom 1:1 Scale Selector Dock (Single-Row <= 7, Multi-Row Grid for 15 Small Arms) */}
      <nav
        className={`cartridge-dock cartridge-switcher-dock ${
          isMultiRowDock ? 'is-multi-row' : ''
        } ${isTankGallery ? 'is-tank-dock' : ''}`}
        data-caliber-count={caliberCount}
        aria-label={ui.caliberSelectorAria}
      >
        <div
          className={`cartridge-dock-strip ${
            isMultiRowDock ? 'is-multi-row-grid' : ''
          }`}
        >
          {activeOrder.map((cal) => {
            const item = CARTRIDGE_LAB_SPECS[cal];
            const isSelected = cal === activeCaliber;
            const heightPct = Math.max(
              18,
              Math.round((item.oalMm / maxOalMm) * 100)
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
                    {formatOrdnanceEnergy(item.muzzleEnergyJ)}
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
