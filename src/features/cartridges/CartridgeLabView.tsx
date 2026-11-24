import React, {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Flame,
  Maximize2,
  Menu,
  RotateCcw,
  Scale,
  Scissors,
  Shield,
  Sparkles,
  Table2,
  X,
} from 'lucide-react';
import {
  type CartridgeAnatomyLayer,
  getCartridgeDossierCollapsed,
  getCartridgeHighlightLayer,
  setCartridgeDossierCollapsed,
  setCartridgeHighlightLayer,
  subscribeCartridgeDossierCollapsed,
  subscribeCartridgeHighlightLayer,
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
import type { CaliberProfile } from '../../weapons/types';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';
import { StudioEnvironmentBar } from '../workbench/StudioEnvironmentBar';
import {
  CARTRIDGE_DUEL_STRINGS,
  type CartridgeSortDir,
  type CartridgeSortKey,
  computeCartridgeDuelMetrics,
  computeSectionalDensity,
  formatMomentumNs,
  formatRatioLabel,
  getSuggestedDuelOpponent,
  sortCartridgeOrder,
} from './cartridgeDuelMath';
import '../../styles/cartridges.css';

const MAX_SMALL_ARMS_OAL_MM = 138.43; // .50 BMG reference 100% bar height
const MAX_TANK_ORDNANCE_OAL_MM = 1150.0; // 125mm DTC10-125 APFSDS reference 100% bar height
const MOBILE_DOSSIER_COLLAPSE_PX = 768;

const CARTRIDGE_WING_BADGES = {
  zh: {
    smallArms: '1:1 弹药纵剖馆 · SAAMI / CIP',
    heavyOrdnance: '1:1 重装炮弹与航炮馆 · 30–125MM',
  },
  en: {
    smallArms: '1:1 ORDNANCE LAB · SAAMI / CIP',
    heavyOrdnance: '1:1 HEAVY ORDNANCE LAB · 30–125MM',
  },
} as const;

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
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [pinnedLayer, setPinnedLayer] = useState<CartridgeAnatomyLayer | null>(
    null
  );
  const [duelOpen, setDuelOpen] = useState(false);
  const [customOpponent, setCustomOpponent] = useState<CaliberProfile | null>(
    null
  );
  const [sortKey, setSortKey] = useState<CartridgeSortKey>('default');
  const [sortDir, setSortDir] = useState<CartridgeSortDir>('desc');

  const dossierCollapsed = useSyncExternalStore(
    subscribeCartridgeDossierCollapsed,
    getCartridgeDossierCollapsed,
    getCartridgeDossierCollapsed
  );
  const highlightedLayer = useSyncExternalStore(
    subscribeCartridgeHighlightLayer,
    getCartridgeHighlightLayer,
    getCartridgeHighlightLayer
  );
  const explodeSliderId = useId();
  const tableCaptionId = useId();
  const duelSelectId = useId();

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.innerWidth <= MOBILE_DOSSIER_COLLAPSE_PX
    ) {
      setCartridgeDossierCollapsed(true);
    }
    return () => {
      setCartridgeDossierCollapsed(false);
      setCartridgeHighlightLayer(null);
    };
  }, []);

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
  const duelUi = CARTRIDGE_DUEL_STRINGS[lang];
  const isZh = lang === 'zh';
  const isTankGallery = isTankOrdnanceProfile(activeCaliber);
  const activeOrder = isTankGallery ? TANK_ORDNANCE_ORDER : CARTRIDGE_LAB_ORDER;
  const sortedOrder = useMemo(
    () => sortCartridgeOrder(activeOrder, sortKey, sortDir),
    [activeOrder, sortKey, sortDir]
  );
  const maxOalMm = isTankGallery
    ? MAX_TANK_ORDNANCE_OAL_MM
    : MAX_SMALL_ARMS_OAL_MM;
  const caliberCount = activeOrder.length;
  const isMultiRowDock = caliberCount > 7;
  const zhCaliberCountWord =
    caliberCount === 17
      ? '十七'
      : caliberCount === 16
        ? '十六'
        : caliberCount === 15
          ? '十五'
          : caliberCount === 11
            ? '十一'
            : caliberCount === 10
              ? '十'
              : caliberCount === 7
                ? '七'
                : caliberCount === 4
                  ? '四'
                  : caliberCount === 3
                    ? '三'
                    : String(caliberCount);
  const spec = CARTRIDGE_LAB_SPECS[activeCaliber];
  const opponentCaliber =
    customOpponent && customOpponent !== activeCaliber
      ? customOpponent
      : getSuggestedDuelOpponent(activeCaliber);
  const opponentSpec = CARTRIDGE_LAB_SPECS[opponentCaliber];
  const duelMetrics = useMemo(
    () => computeCartridgeDuelMetrics(spec, opponentSpec),
    [spec, opponentSpec]
  );
  const primaryWeaponLabel = getLocalizedShortWeaponLabel(
    spec.primaryWeaponId,
    lang
  );

  const handleToggleAnatomyLayer = (layer: CartridgeAnatomyLayer) => {
    const next = pinnedLayer === layer ? null : layer;
    setPinnedLayer(next);
    setCartridgeHighlightLayer(next);
  };

  const handleHoverAnatomyLayer = (layer: CartridgeAnatomyLayer | null) => {
    setCartridgeHighlightLayer(layer ?? pinnedLayer);
  };

  const handleSortColumn = (key: Exclude<CartridgeSortKey, 'default'>) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortDir('asc');
    } else {
      setSortKey('default');
      setSortDir('desc');
    }
  };

  const getAriaSort = (
    key: Exclude<CartridgeSortKey, 'default'>
  ): 'ascending' | 'descending' | 'none' => {
    if (sortKey !== key) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  };

  const renderSortIcon = (key: Exclude<CartridgeSortKey, 'default'>) => {
    if (sortKey !== key) {
      return <ArrowUpDown size={11} className="c-sort-icon" aria-hidden="true" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp size={11} className="c-sort-icon is-active" aria-hidden="true" />
    ) : (
      <ArrowDown size={11} className="c-sort-icon is-active" aria-hidden="true" />
    );
  };

  const handleSwitchGallery = (mode: 'small_arms' | 'tank_ordnance') => {
    setPinnedLayer(null);
    setCartridgeHighlightLayer(null);
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
    '--col-sd': `"${duelUi.colSd}"`,
    '--col-pressure': `"${ui.colPressure}"`,
    '--col-velocity': `"${ui.colVelocity}"`,
    '--col-energy': `"${ui.colEnergy}"`,
    '--col-weapons': `"${ui.colWeapons}"`,
  } as React.CSSProperties;

  return (
    <div className="cartridge-lab-overlay">
      {/* Top Exhibition Header */}
      <header
        className={`cartridge-header ${mobileToolsOpen ? 'is-mobile-expanded' : ''}`}
      >
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
            {isTankGallery
              ? CARTRIDGE_WING_BADGES[lang].heavyOrdnance
              : CARTRIDGE_WING_BADGES[lang].smallArms}
          </div>
          <div className="cartridge-title-wrap">
            <h1 className="brand-title">
              <span className="cartridge-title-full">
                {isTankGallery ? ui.tankOrdnanceTitle : ui.title}
              </span>
              <span className="cartridge-title-compact">
                {isTankGallery
                  ? isZh
                    ? '1:1 坦克炮弹馆'
                    : 'Heavy Ordnance'
                  : isZh
                    ? '1:1 实弹剖视馆'
                    : 'Cartridge Lab'}
              </span>
            </h1>
            <p className="brand-sub">
              {isTankGallery ? ui.tankOrdnanceSubtitle : ui.subtitle}
            </p>
          </div>

          <button
            type="button"
            className={`toggle-chip cartridge-mobile-menu-btn ${
              mobileToolsOpen ? 'active-cyan' : ''
            }`}
            aria-expanded={mobileToolsOpen}
            aria-label={isZh ? '展开弹药馆工具栏' : 'Toggle lab controls'}
            onClick={() => setMobileToolsOpen((prev) => !prev)}
          >
            {mobileToolsOpen ? (
              <X size={14} aria-hidden="true" />
            ) : (
              <Menu size={14} aria-hidden="true" />
            )}
            <span>
              {mobileToolsOpen
                ? isZh
                  ? '收起'
                  : 'Close'
                : isZh
                  ? '工具'
                  : 'Tools'}
            </span>
          </button>
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

            {/* Internal Cutaway Anatomy Breakdown (Interactive 3D Layer Highlight) */}
            <div
              className="cartridge-anatomy-notes"
              onMouseLeave={() => handleHoverAnatomyLayer(null)}
            >
              <span className="c-anatomy-hint">
                <Sparkles size={10} aria-hidden="true" />
                <span>{duelUi.anatomyInteractiveHint}</span>
              </span>
              {(
                [
                  {
                    layer: 'core' as const,
                    label: ui.coreAnatomyLabel,
                    value: isZh ? spec.coreAnatomyZh : spec.coreAnatomyEn,
                  },
                  {
                    layer: 'propellant' as const,
                    label: ui.propellantLabel,
                    value: `${isZh ? spec.propellantTypeZh : spec.propellantTypeEn} (${Math.round(spec.propellantFillRatio * 100)}%)`,
                  },
                  {
                    layer: 'primer' as const,
                    label: ui.primerLabel,
                    value: isZh ? spec.primerTypeZh : spec.primerTypeEn,
                  },
                ] as const
              ).map((item) => {
                const isActiveLayer = highlightedLayer === item.layer;
                return (
                  <button
                    key={item.layer}
                    type="button"
                    data-testid={`cartridge-anatomy-${item.layer}`}
                    className={`c-note-row is-interactive is-layer-${item.layer} ${
                      isActiveLayer ? 'is-highlighted' : ''
                    }`}
                    aria-pressed={pinnedLayer === item.layer}
                    onMouseEnter={() => handleHoverAnatomyLayer(item.layer)}
                    onFocus={() => handleHoverAnatomyLayer(item.layer)}
                    onBlur={() => handleHoverAnatomyLayer(null)}
                    onClick={() => handleToggleAnatomyLayer(item.layer)}
                  >
                    <span className="c-note-key-row">
                      <span className="c-note-key">{item.label}</span>
                      {isActiveLayer && (
                        <span className="c-note-active-pill">
                          {duelUi.anatomyActivePill}
                        </span>
                      )}
                    </span>
                    <span className="c-note-val">{item.value}</span>
                  </button>
                );
              })}
            </div>

            {/* Collapsible Cross-Caliber 1v1 Ballistic Duel Strip */}
            <div className="cartridge-duel-box">
              <button
                type="button"
                className={`cartridge-duel-toggle ${duelOpen ? 'is-open' : ''}`}
                data-testid="cartridge-duel-toggle"
                aria-expanded={duelOpen}
                onClick={() => setDuelOpen((prev) => !prev)}
              >
                <span className="c-duel-toggle-left">
                  <Scale size={12} aria-hidden="true" />
                  <span>{duelUi.duelToggleLabel}</span>
                </span>
                <ChevronDown
                  size={13}
                  className={`c-duel-chevron ${duelOpen ? 'is-rotated' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {duelOpen && (
                <div
                  className="cartridge-duel-panel"
                  data-testid="cartridge-duel-panel"
                >
                  <label htmlFor={duelSelectId} className="sr-only">
                    {duelUi.duelOpponentLabel}
                  </label>
                  <select
                    id={duelSelectId}
                    className="cartridge-duel-select"
                    data-testid="cartridge-duel-select"
                    value={opponentCaliber}
                    onChange={(e) =>
                      setCustomOpponent(e.target.value as CaliberProfile)
                    }
                  >
                    <optgroup label={duelUi.duelGroupSmallArms}>
                      {CARTRIDGE_LAB_ORDER.filter(
                        (c) => c !== activeCaliber
                      ).map((c) => (
                        <option key={c} value={c}>
                          {CARTRIDGE_LAB_SPECS[c].code} ·{' '}
                          {CARTRIDGE_LAB_SPECS[c].oalMm.toFixed(1)} mm
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={duelUi.duelGroupHeavyOrdnance}>
                      {TANK_ORDNANCE_ORDER.filter(
                        (c) => c !== activeCaliber
                      ).map((c) => (
                        <option key={c} value={c}>
                          {CARTRIDGE_LAB_SPECS[c].code} ·{' '}
                          {CARTRIDGE_LAB_SPECS[c].oalMm.toFixed(0)} mm
                        </option>
                      ))}
                    </optgroup>
                  </select>

                  <div className="c-duel-stats-grid">
                    <div className="c-duel-stat">
                      <span>{duelUi.duelEnergyRatio}</span>
                      <strong className="tabular">
                        {formatRatioLabel(duelMetrics.energyRatio)}
                      </strong>
                    </div>
                    <div className="c-duel-stat">
                      <span>{duelUi.duelMomentum}</span>
                      <strong className="tabular">
                        {formatMomentumNs(duelMetrics.primaryMomentumNs)} vs{' '}
                        {formatMomentumNs(duelMetrics.opponentMomentumNs)}
                      </strong>
                    </div>
                    <div className="c-duel-stat">
                      <span>{duelUi.duelSectionalDensity}</span>
                      <strong className="tabular">
                        {duelMetrics.primarySd.metricGCm2} /{' '}
                        {duelMetrics.opponentSd.metricGCm2} g/cm² (
                        {duelMetrics.primarySd.imperialLbIn2} lb/in²)
                      </strong>
                    </div>
                    <div className="c-duel-stat">
                      <span>{duelUi.duelPressureVelocity}</span>
                      <strong className="tabular">
                        {formatRatioLabel(duelMetrics.pressureRatio)} ·{' '}
                        {duelMetrics.velocityDeltaMps >= 0 ? '+' : ''}
                        {duelMetrics.velocityDeltaMps} m/s
                      </strong>
                    </div>
                  </div>

                  {/* Proportional OAL Bar */}
                  <div className="c-duel-oal-block">
                    <div className="c-duel-oal-head">
                      <span>{duelUi.duelOalScale}</span>
                      <strong className="tabular">
                        {formatRatioLabel(duelMetrics.oalRatio)}
                      </strong>
                    </div>
                    {(() => {
                      const maxPairOal = Math.max(
                        spec.oalMm,
                        opponentSpec.oalMm,
                        1
                      );
                      const primaryPct = Math.max(
                        6,
                        (spec.oalMm / maxPairOal) * 100
                      );
                      const oppPct = Math.max(
                        6,
                        (opponentSpec.oalMm / maxPairOal) * 100
                      );
                      return (
                        <div className="c-duel-oal-bars">
                          <div className="c-duel-oal-row">
                            <span className="c-duel-code">{spec.code}</span>
                            <div className="c-duel-bar-track">
                              <div
                                className="c-duel-bar-fill is-primary"
                                style={{ width: `${primaryPct.toFixed(1)}%` }}
                              />
                            </div>
                            <span className="c-duel-mm tabular">
                              {spec.oalMm.toFixed(1)} mm
                            </span>
                          </div>
                          <div className="c-duel-oal-row">
                            <span className="c-duel-code">
                              {opponentSpec.code}
                            </span>
                            <div className="c-duel-bar-track">
                              <div
                                className="c-duel-bar-fill is-opponent"
                                style={{ width: `${oppPct.toFixed(1)}%` }}
                              />
                            </div>
                            <span className="c-duel-mm tabular">
                              {opponentSpec.oalMm.toFixed(1)} mm
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
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
                  <th scope="col" aria-sort={getAriaSort('oal')}>
                    <button
                      type="button"
                      className="c-sort-th-btn"
                      title={duelUi.sortColTitle(ui.colCaseOal)}
                      onClick={() => handleSortColumn('oal')}
                    >
                      <span>{ui.colCaseOal}</span>
                      {renderSortIcon('oal')}
                    </button>
                  </th>
                  <th scope="col" aria-sort={getAriaSort('charge')}>
                    <button
                      type="button"
                      className="c-sort-th-btn"
                      title={duelUi.sortColTitle(ui.colCharge)}
                      onClick={() => handleSortColumn('charge')}
                    >
                      <span>{ui.colCharge}</span>
                      {renderSortIcon('charge')}
                    </button>
                  </th>
                  <th scope="col" aria-sort={getAriaSort('mass')}>
                    <button
                      type="button"
                      className="c-sort-th-btn"
                      title={duelUi.sortColTitle(ui.colProjectile)}
                      onClick={() => handleSortColumn('mass')}
                    >
                      <span>{ui.colProjectile}</span>
                      {renderSortIcon('mass')}
                    </button>
                  </th>
                  <th scope="col" aria-sort={getAriaSort('sd')}>
                    <button
                      type="button"
                      className="c-sort-th-btn"
                      data-testid="cartridge-sort-sd"
                      title={duelUi.sortColTitle(duelUi.colSd)}
                      onClick={() => handleSortColumn('sd')}
                    >
                      <span>{duelUi.colSd}</span>
                      {renderSortIcon('sd')}
                    </button>
                  </th>
                  <th scope="col" aria-sort={getAriaSort('pressure')}>
                    <button
                      type="button"
                      className="c-sort-th-btn"
                      title={duelUi.sortColTitle(ui.colPressure)}
                      onClick={() => handleSortColumn('pressure')}
                    >
                      <span>{ui.colPressure}</span>
                      {renderSortIcon('pressure')}
                    </button>
                  </th>
                  <th scope="col" aria-sort={getAriaSort('velocity')}>
                    <button
                      type="button"
                      className="c-sort-th-btn"
                      title={duelUi.sortColTitle(ui.colVelocity)}
                      onClick={() => handleSortColumn('velocity')}
                    >
                      <span>{ui.colVelocity}</span>
                      {renderSortIcon('velocity')}
                    </button>
                  </th>
                  <th scope="col" aria-sort={getAriaSort('energy')}>
                    <button
                      type="button"
                      className="c-sort-th-btn"
                      title={duelUi.sortColTitle(ui.colEnergy)}
                      onClick={() => handleSortColumn('energy')}
                    >
                      <span>{ui.colEnergy}</span>
                      {renderSortIcon('energy')}
                    </button>
                  </th>
                  <th scope="col">{ui.colWeapons}</th>
                </tr>
              </thead>
              <tbody>
                {sortedOrder.map((cal) => {
                  const row = CARTRIDGE_LAB_SPECS[cal];
                  const sd = computeSectionalDensity(
                    row.projectileMassG,
                    row.bulletDiameterMm
                  );
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
                      <td data-col="sd" className="tabular">
                        {sd.metricGCm2.toFixed(1)} ({sd.imperialLbIn2.toFixed(3)})
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
