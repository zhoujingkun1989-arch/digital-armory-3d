import React, { useEffect, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { playbackClock } from '../../engine/clock/playbackClock';
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
import { CAUSALITY_SANDBOX_STRINGS } from './causalitySandboxStrings';
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

  const ui = CAUSALITY_SANDBOX_STRINGS[lang];
  const archery = isArcheryWeapon(activeWeaponId);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  return (
    <section
      className="causality-sandbox-card"
      data-testid="causality-sandbox-modal"
      aria-label={ui.title}
    >
      <div className="causality-head">
        <div className="causality-title-block">
          <div className="causality-kicker-row">
            <SlidersHorizontal size={12} aria-hidden="true" />
            <span className="causality-badge">{ui.badge}</span>
          </div>
          <h3 className="causality-title">{ui.title}</h3>
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

      <div className="causality-presets-row" role="group" aria-label={ui.presetsHeading}>
        {PRESET_ORDER.map((id) => {
          const item = ui.presets[id];
          const active = enabled && presetId === id;
          return (
            <button
              key={id}
              type="button"
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
            <span>
              {archery ? ui.sliders.gasPortArchery : ui.sliders.gasPort}
            </span>
            <strong className="tabular">{gasPortScale.toFixed(2)}×</strong>
          </div>
          <input
            type="range"
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
            <span>
              {archery
                ? ui.sliders.recoilSpringArchery
                : ui.sliders.recoilSpring}
            </span>
            <strong className="tabular">
              {recoilSpringKScale.toFixed(2)}×
            </strong>
          </div>
          <input
            type="range"
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
            <span>
              {archery ? ui.sliders.boltMassArchery : ui.sliders.boltMass}
            </span>
            <strong className="tabular">{boltMassScale.toFixed(2)}×</strong>
          </div>
          <input
            type="range"
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
            <span>
              {archery ? ui.sliders.powderLoadArchery : ui.sliders.powderLoad}
            </span>
            <strong className="tabular">{powderLoadScale.toFixed(2)}×</strong>
          </div>
          <input
            type="range"
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

      <div className={`causality-diagnostic-banner ${diagClass}`}>
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
