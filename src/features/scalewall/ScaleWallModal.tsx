import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Box,
  Columns2,
  Hand,
  Ruler,
  Scale,
  User,
  X,
  Zap,
} from 'lucide-react';
import { useDialogAccessibility } from '../../app/useDialogAccessibility';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
import { preloadWeaponNarration } from '../../narration/narrationService';
import { useAppStore } from '../../store/useAppStore';
import { preloadWeaponPlugin } from '../../weapons/registry';
import type { WeaponId } from '../../weapons/types';
import { WeaponSilhouetteSvg } from '../armory/WeaponSilhouetteSvg';
import {
  computeBarFillPct,
  computeScaleWallLayout,
  formatScaleEnergy,
  formatScaleLength,
  formatScaleMass,
  formatScaleTickLabel,
  SCALE_WALL_EXHIBITS,
  SCALE_WALL_MAX_EXHIBITS,
  SCALE_WALL_MIN_EXHIBITS,
  SCALE_WALL_PRESETS,
  SCALE_WALL_STRINGS,
  type ScaleBarMode,
  type ScaleReferenceSilhouette,
  type ScaleUnitSystem,
  type ScaleWallPresetId,
} from './scaleWallSpecs';
import '../../styles/scale-wall.css';

export interface ScaleWallModalProps {
  initialPresetId?: ScaleWallPresetId;
  initialWeaponIds?: readonly WeaponId[];
  onClose: () => void;
}

const HumanReferenceSvg: React.FC = () => (
  <svg
    viewBox="0 0 175 34"
    className="sw-ref-svg"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    {/* Horizontal 1,750 mm Vitruvian stature reference silhouette */}
    <circle
      cx="14"
      cy="17"
      r="7.5"
      fill="rgba(56, 189, 248, 0.24)"
      stroke="#38bdf8"
      strokeWidth="1.35"
    />
    <path
      d="M24 17 L30 9.5 L72 10 L78 13 L126 11.5 L168 13 L172 17 L168 21 L126 22.5 L78 21 L72 24 L30 24.5 Z"
      fill="rgba(56, 189, 248, 0.18)"
      stroke="#38bdf8"
      strokeWidth="1.25"
      strokeLinejoin="round"
    />
    <line
      x1="2"
      y1="30.5"
      x2="173"
      y2="30.5"
      stroke="#38bdf8"
      strokeWidth="1.1"
      strokeDasharray="3 2"
    />
    <line x1="2" y1="26" x2="2" y2="33" stroke="#38bdf8" strokeWidth="1.4" />
    <line x1="173" y1="26" x2="173" y2="33" stroke="#38bdf8" strokeWidth="1.4" />
  </svg>
);

const HandReferenceSvg: React.FC = () => (
  <svg
    viewBox="0 0 190 48"
    className="sw-ref-svg"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    {/* 190 mm adult palm-to-fingertip technical outline */}
    <path
      d="M4 22 L42 15 L68 12 L106 8 L156 10 C163 10.5 163 17 156 17.5 L112 18 L181 18.5 C188 19 188 26 181 26.5 L114 26.5 L170 28.5 C177 29 177 35.5 170 36 L108 34.5 L146 37.5 C152 38 152 43.5 145 43.5 L86 40 L48 39 L4 34 Z"
      fill="rgba(52, 211, 153, 0.18)"
      stroke="#34d399"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <line x1="2" y1="45.5" x2="188" y2="45.5" stroke="#34d399" strokeWidth="1.1" strokeDasharray="3 2" />
    <line x1="2" y1="41" x2="2" y2="47.5" stroke="#34d399" strokeWidth="1.4" />
    <line x1="188" y1="41" x2="188" y2="47.5" stroke="#34d399" strokeWidth="1.4" />
  </svg>
);

export const ScaleWallModal: React.FC<ScaleWallModalProps> = ({
  initialPresetId = 'full_spectrum',
  initialWeaponIds,
  onClose,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const lang = useAppStore((s) => s.lang);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const openSplitShowdown = useAppStore((s) => s.openSplitShowdown);
  const setSectionCut = useAppStore((s) => s.setSectionCut);

  const ui = SCALE_WALL_STRINGS[lang];
  const initialPreset =
    SCALE_WALL_PRESETS.find((p) => p.id === initialPresetId) ??
    SCALE_WALL_PRESETS[0];

  const [activePresetId, setActivePresetId] = useState<ScaleWallPresetId | null>(
    initialWeaponIds ? null : initialPreset.id
  );
  const [selectedIds, setSelectedIds] = useState<WeaponId[]>(() => {
    const seed =
      initialWeaponIds && initialWeaponIds.length >= SCALE_WALL_MIN_EXHIBITS
        ? initialWeaponIds.slice(0, SCALE_WALL_MAX_EXHIBITS)
        : initialPreset.weaponIds;
    return [...seed];
  });
  const [unit, setUnit] = useState<ScaleUnitSystem>('metric');
  const [reference, setReference] = useState<ScaleReferenceSilhouette>(
    initialPreset.defaultReference
  );
  const [barMode, setBarMode] = useState<ScaleBarMode>('log');

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

  const layout = useMemo(
    () => computeScaleWallLayout(selectedIds, 920, { reference }),
    [selectedIds, reference]
  );

  const maxMassKg = useMemo(
    () => Math.max(...layout.rows.map((r) => r.exhibit.massKg), 1),
    [layout.rows]
  );
  const maxEnergyJ = useMemo(
    () => Math.max(...layout.rows.map((r) => r.exhibit.muzzleEnergyJ), 1),
    [layout.rows]
  );

  const handleSelectPreset = (presetId: ScaleWallPresetId) => {
    const preset = SCALE_WALL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    playWorkbenchFoley('preset_detent');
    setActivePresetId(preset.id);
    setSelectedIds([...preset.weaponIds]);
    setReference(preset.defaultReference);
  };

  const handleToggleExhibit = (weaponId: WeaponId) => {
    setSelectedIds((prev) => {
      if (prev.includes(weaponId)) {
        if (prev.length <= SCALE_WALL_MIN_EXHIBITS) return prev;
        playWorkbenchFoley('toggle_switch');
        setActivePresetId(null);
        return prev.filter((id) => id !== weaponId);
      }
      if (prev.length >= SCALE_WALL_MAX_EXHIBITS) return prev;
      playWorkbenchFoley('toggle_switch');
      setActivePresetId(null);
      return [...prev, weaponId];
    });
  };

  const handleInspect3d = (weaponId: WeaponId) => {
    playWorkbenchFoley('preset_detent');
    preloadWeaponPlugin(weaponId);
    void preloadWeaponNarration(weaponId);
    onClose();
    enterWorkbench(weaponId);
  };

  const handleCompareTop2Split3d = () => {
    const pairA = layout.rows[0]?.exhibit.weaponId;
    const pairB = layout.rows[1]?.exhibit.weaponId;
    if (!pairA || !pairB) return;
    playWorkbenchFoley('preset_detent');
    preloadWeaponPlugin(pairA);
    preloadWeaponPlugin(pairB);
    void preloadWeaponNarration(pairA);
    void preloadWeaponNarration(pairB);
    onClose();
    openSplitShowdown(pairA, pairB);
    setSectionCut(true);
  };

  const minLenFormatted = formatScaleLength(layout.minExhibitMm, unit);
  const maxLenFormatted = formatScaleLength(layout.maxExhibitMm, unit);

  return (
    <dialog
      ref={dialogRef}
      className="scalewall-dialog"
      data-testid="scale-wall-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="scalewall-shell">
        {/* Header */}
        <header className="scalewall-header">
          <div className="sw-title-block">
            <div className="sw-badge-row">
              <span className="sw-kicker-badge">
                <Ruler size={12} aria-hidden="true" />
                <span>{ui.kicker}</span>
              </span>
              <span className="sw-span-pill tabular" data-testid="scalewall-span-pill">
                {ui.spanPill(layout.spanRatio, minLenFormatted, maxLenFormatted)}
              </span>
            </div>
            <h2 id={titleId} className="sw-title">
              {ui.title}
            </h2>
            <p className="sw-subtitle">{ui.subtitle}</p>
          </div>

          <div className="sw-header-actions">
            <button
              type="button"
              className="sw-split-cta"
              data-testid="scalewall-split3d-btn"
              onClick={handleCompareTop2Split3d}
            >
              <Columns2 size={14} aria-hidden="true" />
              <span>{ui.splitTop2Btn}</span>
            </button>
            <button
              type="button"
              className="sw-close-btn"
              aria-label={ui.closeAria}
              onClick={onClose}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Controls & Curated Presets Strip */}
        <div className="sw-toolbar">
          <div className="sw-presets-group" role="group" aria-label={ui.presetsLabel}>
            {SCALE_WALL_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-testid={`scalewall-preset-${preset.id}`}
                className={`sw-preset-pill ${activePresetId === preset.id ? 'active' : ''}`}
                aria-pressed={activePresetId === preset.id}
                onClick={() => handleSelectPreset(preset.id)}
              >
                <strong>{lang === 'zh' ? preset.titleZh : preset.titleEn}</strong>
                <span className="tabular">
                  {lang === 'zh' ? preset.rangeNoteZh : preset.rangeNoteEn}
                </span>
              </button>
            ))}
          </div>

          <div className="sw-toggles-row">
            <div className="sw-seg-group" role="group" aria-label="Unit System">
              <button
                type="button"
                data-testid="scalewall-unit-metric"
                className={`sw-seg-btn ${unit === 'metric' ? 'active' : ''}`}
                aria-pressed={unit === 'metric'}
                onClick={() => setUnit('metric')}
              >
                {ui.metricLabel}
              </button>
              <button
                type="button"
                data-testid="scalewall-unit-imperial"
                className={`sw-seg-btn ${unit === 'imperial' ? 'active' : ''}`}
                aria-pressed={unit === 'imperial'}
                onClick={() => setUnit('imperial')}
              >
                {ui.imperialLabel}
              </button>
            </div>

            <div className="sw-seg-group" role="group" aria-label="Reference Silhouette">
              <button
                type="button"
                data-testid="scalewall-ref-none"
                className={`sw-seg-btn ${reference === 'none' ? 'active' : ''}`}
                aria-pressed={reference === 'none'}
                onClick={() => setReference('none')}
              >
                {ui.refOff}
              </button>
              <button
                type="button"
                data-testid="scalewall-ref-human"
                className={`sw-seg-btn ${reference === 'human' ? 'active' : ''}`}
                aria-pressed={reference === 'human'}
                onClick={() => setReference('human')}
              >
                <User size={11} aria-hidden="true" />
                <span>{ui.refHuman}</span>
              </button>
              <button
                type="button"
                data-testid="scalewall-ref-hand"
                className={`sw-seg-btn ${reference === 'hand' ? 'active' : ''}`}
                aria-pressed={reference === 'hand'}
                onClick={() => setReference('hand')}
              >
                <Hand size={11} aria-hidden="true" />
                <span>{ui.refHand}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="scalewall-body">
          {/* Illuminated 1:1 Architectural Blueprint Drafting Grid */}
          <section
            className="sw-blueprint-stage"
            data-testid="scalewall-blueprint-grid"
          >
            <div className="sw-blueprint-scroll-inner">
            {/* Top Drafting Ruler */}
            <div className="sw-ruler-row">
              <div className="sw-ruler-meta tabular">
                {ui.rulerCaption(formatScaleTickLabel(layout.tickStepMm, unit))}
              </div>
              <div className="sw-ruler-track">
                {layout.ticks.map((tick) => (
                  <span
                    key={tick.mm}
                    className="sw-ruler-tick tabular"
                    style={{ left: `${tick.xPct}%` }}
                  >
                    {formatScaleTickLabel(tick.mm, unit)}
                  </span>
                ))}
              </div>
            </div>

            {/* Optional 1,750 mm Human / 190 mm Hand Reference Lane */}
            {layout.reference && (
              <div
                className="sw-lane sw-reference-lane"
                data-testid="scalewall-reference-lane"
                data-ref-kind={layout.reference.kind}
              >
                <div className="sw-lane-meta">
                  <span className="sw-ref-chip">
                    {layout.reference.kind === 'human' ? (
                      <User size={11} aria-hidden="true" />
                    ) : (
                      <Hand size={11} aria-hidden="true" />
                    )}
                    <span>
                      {formatScaleLength(layout.reference.lengthMm, unit)}
                    </span>
                  </span>
                  <span className="sw-ref-caption">
                    {layout.reference.kind === 'human'
                      ? ui.refHumanCaption
                      : ui.refHandCaption}
                  </span>
                </div>

                <div className="sw-lane-canvas">
                  {layout.ticks.map((tick) => (
                    <span
                      key={tick.mm}
                      className="sw-grid-line"
                      style={{ left: `${tick.xPct}%` }}
                      aria-hidden="true"
                    />
                  ))}
                  <div
                    className="sw-ref-bar"
                    style={{ width: `${layout.reference.widthPct}%` }}
                  >
                    {layout.reference.kind === 'human' ? (
                      <HumanReferenceSvg />
                    ) : (
                      <HandReferenceSvg />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Stacked 1:1 Exhibit Lanes */}
            {layout.rows.map((row) => {
              const { exhibit } = row;
              const shortLabel = getLocalizedShortWeaponLabel(
                exhibit.weaponId,
                lang
              );
              const pctOfWidest = Math.max(
                0.1,
                Number((row.ratioToWidest * 100).toFixed(1))
              );
              const canRemove = selectedIds.length > SCALE_WALL_MIN_EXHIBITS;

              return (
                <div
                  key={exhibit.weaponId}
                  className="sw-lane"
                  data-testid={`scalewall-lane-${exhibit.weaponId}`}
                  data-oal-mm={exhibit.oalMm}
                  data-width-pct={row.widthPct}
                >
                  <div className="sw-lane-meta">
                    <div className="sw-lane-head">
                      <span
                        className="sw-bay-tag"
                        style={{ borderColor: exhibit.accentColor }}
                      >
                        {exhibit.bayCode}
                      </span>
                      <strong className="sw-exhibit-name">{shortLabel}</strong>
                      <span className="sw-era-tag tabular">
                        {exhibit.eraYear}
                      </span>
                    </div>
                    <span className="sw-caliber-line">
                      {lang === 'zh'
                        ? exhibit.caliberLabelZh
                        : exhibit.caliberLabel}
                    </span>
                    <div className="sw-lane-actions">
                      <button
                        type="button"
                        className="sw-inspect-btn"
                        data-testid={`scalewall-inspect-${exhibit.weaponId}`}
                        onClick={() => handleInspect3d(exhibit.weaponId)}
                      >
                        <Box size={11} aria-hidden="true" />
                        <span>{ui.inspect3dBtn}</span>
                      </button>
                      {canRemove && (
                        <button
                          type="button"
                          className="sw-remove-btn"
                          aria-label={ui.removeExhibitAria(shortLabel)}
                          onClick={() => handleToggleExhibit(exhibit.weaponId)}
                        >
                          <X size={11} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="sw-lane-canvas">
                    {layout.ticks.map((tick) => (
                      <span
                        key={tick.mm}
                        className="sw-grid-line"
                        style={{ left: `${tick.xPct}%` }}
                        aria-hidden="true"
                      />
                    ))}

                    <div className="sw-silhouette-row">
                      <div
                        className="sw-true-scale-box"
                        style={{
                          width: `${row.widthPct}%`,
                          borderRightColor: exhibit.accentColor,
                        }}
                      >
                        <div className="sw-silhouette-inner">
                          <WeaponSilhouetteSvg
                            id={exhibit.weaponId}
                            available
                          />
                        </div>
                        <span
                          className="sw-dim-baseline"
                          style={{ background: exhibit.accentColor }}
                          aria-hidden="true"
                        />
                      </div>

                      <div className="sw-dim-callout tabular">
                        <strong style={{ color: exhibit.accentColor }}>
                          {formatScaleLength(exhibit.oalMm, unit)}
                        </strong>
                        <span>{ui.ofWidestLabel(pctOfWidest)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </section>

          {/* Synchronized Quantitative Comparison Bars */}
          <section
            className="sw-metrics-panel"
            data-testid="scalewall-metrics-panel"
          >
            <div className="sw-section-head">
              <div className="sw-section-title">
                <Scale size={13} aria-hidden="true" />
                <h3>{ui.metricsHeading}</h3>
              </div>
              <div className="sw-seg-group" role="group" aria-label="Bar Scale Mode">
                <button
                  type="button"
                  data-testid="scalewall-bar-mode-log"
                  className={`sw-seg-btn ${barMode === 'log' ? 'active' : ''}`}
                  aria-pressed={barMode === 'log'}
                  onClick={() => setBarMode('log')}
                >
                  {ui.barModeLog}
                </button>
                <button
                  type="button"
                  data-testid="scalewall-bar-mode-linear"
                  className={`sw-seg-btn ${barMode === 'linear' ? 'active' : ''}`}
                  aria-pressed={barMode === 'linear'}
                  onClick={() => setBarMode('linear')}
                >
                  {ui.barModeLinear}
                </button>
              </div>
            </div>

            <div className="sw-metrics-grid">
              {/* Length Column */}
              <div className="sw-metric-card">
                <div className="sw-metric-card-head">
                  <Ruler size={12} aria-hidden="true" />
                  <span>{ui.colLength}</span>
                </div>
                {layout.rows.map(({ exhibit }) => {
                  const pct = computeBarFillPct(
                    exhibit.oalMm,
                    layout.maxExhibitMm,
                    barMode
                  );
                  return (
                    <div key={exhibit.weaponId} className="sw-bar-row">
                      <div className="sw-bar-label-row">
                        <span>
                          {getLocalizedShortWeaponLabel(exhibit.weaponId, lang)}
                        </span>
                        <strong className="tabular">
                          {formatScaleLength(exhibit.oalMm, unit)}
                        </strong>
                      </div>
                      <div className="sw-bar-track">
                        <div
                          className="sw-bar-fill"
                          style={{
                            width: `${pct}%`,
                            background: exhibit.accentColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Mass Column */}
              <div className="sw-metric-card">
                <div className="sw-metric-card-head">
                  <Scale size={12} aria-hidden="true" />
                  <span>{ui.colMass}</span>
                </div>
                {layout.rows.map(({ exhibit }) => {
                  const pct = computeBarFillPct(
                    exhibit.massKg,
                    maxMassKg,
                    barMode
                  );
                  return (
                    <div key={exhibit.weaponId} className="sw-bar-row">
                      <div className="sw-bar-label-row">
                        <span>
                          {getLocalizedShortWeaponLabel(exhibit.weaponId, lang)}
                        </span>
                        <strong className="tabular">
                          {formatScaleMass(exhibit.massKg, unit, lang)}
                        </strong>
                      </div>
                      <div className="sw-bar-track">
                        <div
                          className="sw-bar-fill"
                          style={{
                            width: `${pct}%`,
                            background: exhibit.accentColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Muzzle Energy Column */}
              <div className="sw-metric-card">
                <div className="sw-metric-card-head">
                  <Zap size={12} aria-hidden="true" />
                  <span>{ui.colEnergy}</span>
                </div>
                {layout.rows.map(({ exhibit }) => {
                  const pct = computeBarFillPct(
                    exhibit.muzzleEnergyJ,
                    maxEnergyJ,
                    barMode
                  );
                  return (
                    <div key={exhibit.weaponId} className="sw-bar-row">
                      <div className="sw-bar-label-row">
                        <span>
                          {getLocalizedShortWeaponLabel(exhibit.weaponId, lang)}
                        </span>
                        <strong className="tabular">
                          {formatScaleEnergy(exhibit.muzzleEnergyJ, unit)}
                        </strong>
                      </div>
                      <div className="sw-bar-track">
                        <div
                          className="sw-bar-fill"
                          style={{
                            width: `${pct}%`,
                            background: exhibit.accentColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Interactive 34-Exhibit Picker */}
          <section
            className="sw-picker-section"
            data-testid="scalewall-exhibit-picker"
          >
            <div className="sw-picker-head">
              <div>
                <h3>
                  {ui.pickerHeading(
                    selectedIds.length,
                    SCALE_WALL_MAX_EXHIBITS
                  )}
                </h3>
                <p>
                  {selectedIds.length >= SCALE_WALL_MAX_EXHIBITS
                    ? ui.maxReachedNote
                    : ui.pickerHint}
                </p>
              </div>
            </div>

            <div className="sw-picker-grid">
              {SCALE_WALL_EXHIBITS.map((exhibit) => {
                const isSelected = selectedIds.includes(exhibit.weaponId);
                const disabled =
                  (!isSelected &&
                    selectedIds.length >= SCALE_WALL_MAX_EXHIBITS) ||
                  (isSelected && selectedIds.length <= SCALE_WALL_MIN_EXHIBITS);

                return (
                  <button
                    key={exhibit.weaponId}
                    type="button"
                    data-testid={`scalewall-pick-${exhibit.weaponId}`}
                    className={`sw-pick-chip ${isSelected ? 'is-selected' : ''}`}
                    aria-pressed={isSelected}
                    disabled={disabled}
                    onClick={() => handleToggleExhibit(exhibit.weaponId)}
                  >
                    <span className="sw-pick-bay tabular">
                      {exhibit.bayCode.replace('BAY-', '#')}
                    </span>
                    <strong>
                      {getLocalizedShortWeaponLabel(exhibit.weaponId, lang)}
                    </strong>
                    <span className="sw-pick-len tabular">
                      {formatScaleTickLabel(exhibit.oalMm, unit)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </dialog>
  );
};

export default ScaleWallModal;
