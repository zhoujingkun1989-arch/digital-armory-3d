import React, { useCallback, useEffect, useId, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FlaskConical,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useDialogAccessibility } from '../../app/useDialogAccessibility';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { playbackClock } from '../../engine/clock/playbackClock';
import { getGlossaryTermsForWeapon } from '../../engine/encyclopedia/engineeringGlossary';
import {
  createInternalBallisticsSample,
  evaluateInternalBallisticsInto,
  getCaliberBallisticsSpec,
  getWeaponFiringTiming,
  isArcheryWeapon,
} from '../../engine/physics/armoryPhysics';
import {
  type CausalityPresetId,
  evaluateCausalityPhysics,
  useCausalitySandboxStore,
} from '../../engine/physics/causalitySandbox';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import {
  CAUSALITY_EXPERIMENTS,
  CAUSALITY_SANDBOX_STRINGS,
  type CausalityExperimentSpec,
  computeMechanicalMarginGauges,
  matchActiveCausalityExperiment,
} from './causalitySandboxStrings';
import '../../styles/causality-sandbox.css';

const PRESET_ORDER: readonly CausalityPresetId[] = [
  'factory',
  'suppressed_overgas',
  'subsonic_underpower',
  'lightweight_competition',
  'heavy_arctic_buffer',
];

const CausalitySandboxModal: React.FC = () => {
  const lang = useAppStore((s) => s.lang);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const isFiringPlaying = useAppStore((s) => s.isFiringPlaying);
  const toggleFiringPlay = useAppStore((s) => s.toggleFiringPlay);
  const setCausalitySandboxOpen = useAppStore(
    (s) => s.setCausalitySandboxOpen
  );

  const enabled = useCausalitySandboxStore((s) => s.enabled);
  const gasPortScale = useCausalitySandboxStore((s) => s.gasPortScale);
  const recoilSpringKScale = useCausalitySandboxStore(
    (s) => s.recoilSpringKScale
  );
  const boltMassScale = useCausalitySandboxStore((s) => s.boltMassScale);
  const powderLoadScale = useCausalitySandboxStore((s) => s.powderLoadScale);
  const presetId = useCausalitySandboxStore((s) => s.presetId);
  const setEnabled = useCausalitySandboxStore((s) => s.setEnabled);
  const setGasPortScale = useCausalitySandboxStore((s) => s.setGasPortScale);
  const setRecoilSpringKScale = useCausalitySandboxStore(
    (s) => s.setRecoilSpringKScale
  );
  const setBoltMassScale = useCausalitySandboxStore((s) => s.setBoltMassScale);
  const setPowderLoadScale = useCausalitySandboxStore(
    (s) => s.setPowderLoadScale
  );
  const applyPreset = useCausalitySandboxStore((s) => s.applyPreset);
  const reset = useCausalitySandboxStore((s) => s.reset);

  const titleId = useId();
  const containerRef = useRef<HTMLElement>(null);
  const ui = CAUSALITY_SANDBOX_STRINGS[lang];
  const archery = isArcheryWeapon(activeWeaponId);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleClose = useCallback(() => {
    playWorkbenchFoley('toggle_switch');
    setCausalitySandboxOpen(false);
  }, [setCausalitySandboxOpen]);

  useDialogAccessibility({
    isOpen: true,
    containerRef,
    onClose: handleClose,
  });

  const evaluation = evaluateCausalityPhysics(activeWeaponId, {
    gasPortScale: enabled ? gasPortScale : 1.0,
    recoilSpringKScale: enabled ? recoilSpringKScale : 1.0,
    boltMassScale: enabled ? boltMassScale : 1.0,
    powderLoadScale: enabled ? powderLoadScale : 1.0,
  });

  // Live 60fps Canvas2D comparison curve (Baseline vs Sandbox + Playhead)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const manifest = getWeaponManifest(activeWeaponId);
    const spec = getCaliberBallisticsSpec(manifest.caliberProfile);
    const timing = getWeaponFiringTiming(activeWeaponId);
    const sample = createInternalBallisticsSample();
    const pressureFactor = Math.pow(enabled ? powderLoadScale : 1.0, 1.32);
    const maxP = Math.max(
      1,
      evaluation.baselinePeakMPa,
      evaluation.modifiedPeakMPa
    ) * 1.12;

    let rafId = 0;
    const fMax = 0.72;

    const drawFrame = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 356;
      const cssH = canvas.clientHeight || 112;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const isLight =
        document.documentElement.dataset.theme === 'light';
      const gridColor = isLight
        ? 'rgba(15, 23, 42, 0.08)'
        : 'rgba(148, 163, 184, 0.14)';
      const baseLineColor = isLight
        ? 'rgba(100, 116, 139, 0.72)'
        : 'rgba(148, 163, 184, 0.65)';
      const modColor =
        evaluation.status === 'overgassed_early_unlock' ||
        evaluation.status === 'excessive_bolt_velocity'
          ? '#f97316'
          : evaluation.status === 'short_stroke_fte'
            ? '#facc15'
            : '#38bdf8';

      const padL = 8;
      const padR = 8;
      const padT = 10;
      const padB = 10;
      const plotW = cssW - padL - padR;
      const plotH = cssH - padT - padB;

      const xForF = (f: number) =>
        padL + Math.max(0, Math.min(1, f / fMax)) * plotW;
      const yForP = (p: number) =>
        padT + (1 - Math.max(0, Math.min(1, p / maxP))) * plotH;

      // Subtle grid
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      for (let g = 1; g <= 3; g++) {
        const y = padT + (plotH * g) / 4;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + plotW, y);
        ctx.stroke();
      }

      // Safe unlock pressure ceiling line
      const safeY = yForP(evaluation.safeUnlockPressureMPa);
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = isLight
        ? 'rgba(22, 163, 74, 0.68)'
        : 'rgba(52, 211, 153, 0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, safeY);
      ctx.lineTo(padL + plotW, safeY);
      ctx.stroke();
      ctx.restore();

      const steps = 72;
      // Baseline curve (dashed)
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = baseLineColor;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const f = (i / steps) * fMax;
        evaluateInternalBallisticsInto(
          manifest.caliberProfile,
          f,
          sample,
          timing
        );
        const x = xForF(f);
        const y = yForP(sample.pressureMPa);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // Modified curve (solid + subtle area fill)
      ctx.save();
      ctx.strokeStyle = modColor;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const f = (i / steps) * fMax;
        evaluateInternalBallisticsInto(
          manifest.caliberProfile,
          f,
          sample,
          timing
        );
        const p = sample.pressureMPa * pressureFactor;
        const x = xForF(f);
        const y = yForP(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // Modified unlock dot
      const unlockX = xForF(evaluation.unlockProgressF);
      const unlockY = yForP(evaluation.chamberPressureAtUnlockMPa);
      const hazard =
        evaluation.chamberPressureAtUnlockMPa >
        evaluation.safeUnlockPressureMPa * 1.15;
      ctx.fillStyle = hazard ? '#ef4444' : '#34d399';
      ctx.beginPath();
      ctx.arc(unlockX, unlockY, 4.2, 0, Math.PI * 2);
      ctx.fill();

      // Real-time animatedFireProgress cursor
      const curF = playbackClock.getState().animatedFireProgress;
      if (curF <= fMax) {
        const cx = xForF(curF);
        ctx.strokeStyle = isLight
          ? 'rgba(14, 165, 233, 0.75)'
          : 'rgba(248, 250, 252, 0.72)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(cx, padT);
        ctx.lineTo(cx, padT + plotH);
        ctx.stroke();
      }

      // Guard unused warning on spec
      void spec;

      rafId = window.requestAnimationFrame(drawFrame);
    };

    rafId = window.requestAnimationFrame(drawFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [
    activeWeaponId,
    enabled,
    powderLoadScale,
    evaluation.baselinePeakMPa,
    evaluation.modifiedPeakMPa,
    evaluation.safeUnlockPressureMPa,
    evaluation.unlockProgressF,
    evaluation.chamberPressureAtUnlockMPa,
    evaluation.status,
  ]);

  const diag = ui.diagnostics[evaluation.status];
  const diagClass =
    evaluation.status === 'nominal'
      ? 'is-nominal'
      : evaluation.status === 'short_stroke_fte'
        ? 'is-warning'
        : 'is-hazard';

  const activeExperimentId = enabled
    ? matchActiveCausalityExperiment({
        gasPortScale,
        recoilSpringKScale,
        boltMassScale,
        powderLoadScale,
      })
    : null;

  const marginGauges = computeMechanicalMarginGauges(evaluation);
  const primaryPrinciple = getGlossaryTermsForWeapon(activeWeaponId)[0] ?? null;

  const gasPortLabel = archery ? ui.sliders.gasPortArchery : ui.sliders.gasPort;
  const recoilSpringLabel = archery
    ? ui.sliders.recoilSpringArchery
    : ui.sliders.recoilSpring;
  const boltMassLabel = archery
    ? ui.sliders.boltMassArchery
    : ui.sliders.boltMass;
  const powderLoadLabel = archery
    ? ui.sliders.powderLoadArchery
    : ui.sliders.powderLoad;

  const gasPortValueText =
    lang === 'zh'
      ? `${Math.round(gasPortScale * 100)}% ${archery ? '凸轮储能' : '导气流量'}（${gasPortScale.toFixed(2)}×）`
      : `${Math.round(gasPortScale * 100)}% ${archery ? 'cam energy' : 'gas port flow'} (${gasPortScale.toFixed(2)}x factory)`;
  const recoilSpringValueText =
    lang === 'zh'
      ? `${Math.round(recoilSpringKScale * 100)}% 弹簧刚度（${recoilSpringKScale.toFixed(2)}×）`
      : `${Math.round(recoilSpringKScale * 100)}% spring rate (${recoilSpringKScale.toFixed(2)}x factory)`;
  const boltMassValueText =
    lang === 'zh'
      ? `${Math.round(boltMassScale * 100)}% ${archery ? '箭矢质量' : '枪机质量'}（${boltMassScale.toFixed(2)}×）`
      : `${Math.round(boltMassScale * 100)}% ${archery ? 'arrow mass' : 'bolt carrier mass'} (${boltMassScale.toFixed(2)}x factory)`;
  const powderLoadValueText =
    lang === 'zh'
      ? `峰值膛压 ${evaluation.modifiedPeakMPa.toFixed(1)} MPa（${Math.round(powderLoadScale * 100)}% ${archery ? '拉力峰值' : '装药量'}）`
      : `Peak pressure ${evaluation.modifiedPeakMPa.toFixed(1)} MPa (${Math.round(powderLoadScale * 100)}% ${archery ? 'draw load' : 'charge'})`;

  const handleRunExperiment = useCallback(
    (exp: CausalityExperimentSpec) => {
      playWorkbenchFoley('preset_detent');
      setGasPortScale(exp.params.gasPortScale);
      setRecoilSpringKScale(exp.params.recoilSpringKScale);
      setBoltMassScale(exp.params.boltMassScale);
      setPowderLoadScale(exp.params.powderLoadScale);
      setEnabled(true);
      if (mode !== 'firing') {
        setMode('firing');
      }
    },
    [
      mode,
      setBoltMassScale,
      setEnabled,
      setGasPortScale,
      setMode,
      setPowderLoadScale,
      setRecoilSpringKScale,
    ]
  );

  return (
    <section
      ref={containerRef}
      className="causality-sandbox-card"
      data-testid="causality-sandbox-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <div className="causality-head">
        <div className="causality-title-block">
          <div className="causality-kicker-row">
            <SlidersHorizontal size={12} aria-hidden="true" />
            <span className="causality-badge">{ui.badge}</span>
          </div>
          <h3 id={titleId} className="causality-title">
            {ui.title}
          </h3>
        </div>

        <div className="causality-head-actions">
          <button
            type="button"
            className={`causality-pill-btn ${enabled ? 'is-live' : ''}`}
            aria-pressed={enabled}
            onClick={() => {
              playWorkbenchFoley('toggle_switch');
              const next = !enabled;
              setEnabled(next);
              if (next && mode !== 'firing') {
                setMode('firing');
              }
            }}
          >
            <Activity size={12} aria-hidden="true" />
            <span>{enabled ? ui.liveOn : ui.liveOff}</span>
          </button>

          <button
            type="button"
            className={`causality-icon-btn ${
              mode === 'firing' && isFiringPlaying ? 'is-playing' : ''
            }`}
            aria-label={
              mode === 'firing' && isFiringPlaying
                ? ui.pauseFiring
                : ui.playFiring
            }
            aria-pressed={mode === 'firing' && isFiringPlaying}
            title={
              mode === 'firing' && isFiringPlaying
                ? ui.pauseFiring
                : ui.playFiring
            }
            onClick={() => {
              playWorkbenchFoley('toggle_switch');
              if (mode !== 'firing') {
                setMode('firing');
              } else {
                toggleFiringPlay();
              }
            }}
          >
            {mode === 'firing' && isFiringPlaying ? (
              <Pause size={13} aria-hidden="true" />
            ) : (
              <Play size={13} aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            className="causality-icon-btn"
            aria-label={ui.reset}
            title={ui.reset}
            onClick={() => {
              playWorkbenchFoley('preset_detent');
              reset();
              setEnabled(true);
            }}
          >
            <RotateCcw size={13} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="causality-icon-btn"
            aria-label={ui.close}
            title={ui.close}
            onClick={() => {
              playWorkbenchFoley('toggle_switch');
              setCausalitySandboxOpen(false);
            }}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="causality-sub">
        {archery ? ui.archerySubtitle : ui.subtitle}
      </p>

      {primaryPrinciple && (
        <div
          className="causality-principle-context"
          data-testid="causality-principle-context"
        >
          <div className="causality-principle-head">
            <BookOpen size={11} aria-hidden="true" />
            <span className="causality-principle-kicker">
              {lang === 'zh' ? '当前机构核心原理' : 'ACTIVE MECHANISM PRINCIPLE'}
            </span>
            <strong>
              {lang === 'zh' ? primaryPrinciple.termZh : primaryPrinciple.termEn}
            </strong>
          </div>
          <p className="causality-principle-summary">
            {lang === 'zh'
              ? primaryPrinciple.summaryZh
              : primaryPrinciple.summaryEn}
          </p>
        </div>
      )}

      {/* Ciechanowski-Grade Guided Physics Experiments */}
      <div className="causality-experiments-section">
        <div className="causality-section-label">
          <FlaskConical size={11} aria-hidden="true" />
          <span>{ui.experimentsHeading}</span>
        </div>
        <div
          className="causality-experiments-grid"
          role="group"
          aria-label={ui.experimentsHeading}
        >
          {CAUSALITY_EXPERIMENTS.map((exp) => {
            const copy = ui.experiments[exp.id];
            const isActive = activeExperimentId === exp.id;
            const toneClass =
              exp.expectedRegime === 'nominal'
                ? 'is-nominal'
                : exp.expectedRegime === 'short_stroke_fte'
                  ? 'is-warning'
                  : 'is-hazard';
            return (
              <button
                key={exp.id}
                type="button"
                data-experiment-id={exp.id}
                aria-pressed={isActive}
                className={`causality-experiment-btn ${toneClass} ${
                  isActive ? 'is-active' : ''
                }`}
                onClick={() => handleRunExperiment(exp)}
              >
                <span className="causality-exp-head">
                  <span className="causality-exp-label">{copy.label}</span>
                  <span className="causality-exp-tag">{copy.tag}</span>
                </span>
              </button>
            );
          })}
        </div>
        {activeExperimentId && (
          <p className="causality-experiment-insight">
            {ui.experiments[activeExperimentId].insight}
          </p>
        )}
      </div>

      {/* Animated Visual Mechanical Margin Gauges */}
      <div
        className="causality-gauges-panel"
        aria-label={ui.gaugesHeading}
      >
        <div className="causality-section-label">
          <Gauge size={11} aria-hidden="true" />
          <span>{ui.gaugesHeading}</span>
        </div>
        <div className="causality-gauges-stack">
          {marginGauges.map((g) => {
            const meta = ui.gauges[g.id];
            return (
              <div
                key={g.id}
                className={`causality-gauge-row is-${g.tone}`}
                data-gauge-id={g.id}
              >
                <div className="causality-gauge-meta">
                  <span className="causality-gauge-name">{meta.label}</span>
                  <span className="causality-gauge-values">
                    <span className="causality-gauge-sub tabular">
                      {g.subLabel}
                    </span>
                    <strong className="causality-gauge-val tabular">
                      {g.formattedValue}
                    </strong>
                  </span>
                </div>
                <div
                  className="causality-gauge-track"
                  role="meter"
                  aria-label={meta.label}
                  aria-valuemin={g.minValue}
                  aria-valuemax={g.maxValue}
                  aria-valuenow={g.numericValue}
                  aria-valuetext={g.formattedValue}
                >
                  <div
                    className={`causality-gauge-fill is-${g.tone}`}
                    style={{ width: `${g.fillPct.toFixed(1)}%` }}
                  />
                  <span
                    className="causality-gauge-threshold"
                    style={{ left: `${g.thresholdPct.toFixed(1)}%` }}
                    title={meta.threshold}
                    aria-hidden="true"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="causality-presets-row" role="group" aria-label={ui.presetsHeading}>
        {PRESET_ORDER.map((id) => {
          const item = ui.presets[id];
          const active = enabled && presetId === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              className={`causality-preset-pill ${active ? 'is-active' : ''}`}
              title={item.hint}
              onClick={() => {
                playWorkbenchFoley('preset_detent');
                applyPreset(id);
                if (mode !== 'firing') {
                  setMode('firing');
                }
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="causality-sliders-grid">
        <label className="causality-slider-row">
          <div className="causality-slider-meta">
            <span>{gasPortLabel}</span>
            <strong className="tabular">{gasPortScale.toFixed(2)}×</strong>
          </div>
          <input
            type="range"
            aria-label={gasPortLabel}
            aria-valuetext={gasPortValueText}
            min={0.6}
            max={1.5}
            step={0.02}
            value={gasPortScale}
            onChange={(e) => {
              setGasPortScale(Number(e.target.value));
              if (mode !== 'firing') setMode('firing');
            }}
          />
        </label>

        <label className="causality-slider-row">
          <div className="causality-slider-meta">
            <span>{recoilSpringLabel}</span>
            <strong className="tabular">
              {recoilSpringKScale.toFixed(2)}×
            </strong>
          </div>
          <input
            type="range"
            aria-label={recoilSpringLabel}
            aria-valuetext={recoilSpringValueText}
            min={0.55}
            max={1.7}
            step={0.02}
            value={recoilSpringKScale}
            onChange={(e) => {
              setRecoilSpringKScale(Number(e.target.value));
              if (mode !== 'firing') setMode('firing');
            }}
          />
        </label>

        <label className="causality-slider-row">
          <div className="causality-slider-meta">
            <span>{boltMassLabel}</span>
            <strong className="tabular">{boltMassScale.toFixed(2)}×</strong>
          </div>
          <input
            type="range"
            aria-label={boltMassLabel}
            aria-valuetext={boltMassValueText}
            min={0.65}
            max={1.65}
            step={0.02}
            value={boltMassScale}
            onChange={(e) => {
              setBoltMassScale(Number(e.target.value));
              if (mode !== 'firing') setMode('firing');
            }}
          />
        </label>

        <label className="causality-slider-row">
          <div className="causality-slider-meta">
            <span>{powderLoadLabel}</span>
            <strong className="tabular">{powderLoadScale.toFixed(2)}×</strong>
          </div>
          <input
            type="range"
            aria-label={powderLoadLabel}
            aria-valuetext={powderLoadValueText}
            min={0.75}
            max={1.35}
            step={0.01}
            value={powderLoadScale}
            onChange={(e) => {
              setPowderLoadScale(Number(e.target.value));
              if (mode !== 'firing') setMode('firing');
            }}
          />
        </label>
      </div>

      <div className="causality-canvas-wrap">
        <div className="causality-canvas-legend">
          <span className="legend-dot is-base">{ui.plot.legendBaseline}</span>
          <span className="legend-dot is-mod">{ui.plot.legendModified}</span>
          <span className="legend-dot is-safe">{ui.plot.legendSafeLimit}</span>
        </div>
        <canvas ref={canvasRef} className="causality-canvas" />
      </div>

      <div className="causality-metrics-grid">
        <div className="causality-metric-cell">
          <span>{ui.metrics.cadence}</span>
          <strong className="tabular">
            {Math.round(evaluation.modifiedRpm)} RPM
          </strong>
        </div>
        <div className="causality-metric-cell">
          <span>{ui.metrics.peakPressure}</span>
          <strong className="tabular">
            {evaluation.modifiedPeakMPa.toFixed(1)} MPa
          </strong>
        </div>
        <div className="causality-metric-cell">
          <span>{ui.metrics.unlockPressure}</span>
          <strong className="tabular">
            {evaluation.chamberPressureAtUnlockMPa.toFixed(1)} MPa
          </strong>
        </div>
        <div className="causality-metric-cell">
          <span>{ui.metrics.stroke}</span>
          <strong className="tabular">
            {Math.round(evaluation.strokeRatio * 100)}%
          </strong>
        </div>
      </div>

      <div
        className={`causality-diagnostic-banner ${diagClass}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="causality-diag-head">
          {evaluation.status === 'nominal' ? (
            <CheckCircle2 size={14} aria-hidden="true" />
          ) : (
            <AlertTriangle size={14} aria-hidden="true" />
          )}
          <strong>{diag.label}</strong>
        </div>
        <p>{diag.desc}</p>
      </div>
    </section>
  );
};

export default CausalitySandboxModal;
