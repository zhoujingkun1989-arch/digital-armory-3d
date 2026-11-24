import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Box,
  Columns2,
  Flame,
  Gauge,
  Shield,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useDialogAccessibility } from '../../app/useDialogAccessibility';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
import { preloadWeaponNarration } from '../../narration/narrationService';
import { useAppStore } from '../../store/useAppStore';
import { preloadWeaponPlugin } from '../../weapons/registry';
import type { WeaponId } from '../../weapons/types';
import {
  evaluateRecoilDynamics,
  formatForceValue,
  formatImpulse,
  formatRecoilEnergy,
  formatTorque,
  RECOIL_EXHIBIT_PROFILES,
  RECOIL_LAB_STRINGS,
  RECOIL_MATCHUP_PRESETS,
  RECOIL_WAVEFORM_WINDOW_MS,
  type RecoilDynamicsResult,
  type RecoilMuzzleOption,
  type RecoilPresetId,
} from './recoilPhysics';
import '../../styles/recoil-lab.css';

export interface RecoilLabModalProps {
  initialPresetId?: RecoilPresetId;
  initialWeaponA?: WeaponId;
  initialWeaponB?: WeaponId;
  onClose: () => void;
}

const MUZZLE_OPTIONS: readonly RecoilMuzzleOption[] = [
  'raw',
  'factory',
  'brake',
  'suppressor',
] as const;

function buildWaveformPath(
  result: RecoilDynamicsResult,
  yMaxN: number,
  plotLeft: number,
  plotTop: number,
  plotW: number,
  plotH: number
): { lineD: string; areaD: string; peakX: number; peakY: number } {
  const safeMax = Math.max(1e-3, yMaxN);
  const pts: string[] = [];
  let peakX = plotLeft;
  let peakY = plotTop + plotH;
  let maxForce = -1;

  for (let i = 0; i < result.waveform.length; i += 1) {
    const s = result.waveform[i];
    const x = plotLeft + (s.tMs / RECOIL_WAVEFORM_WINDOW_MS) * plotW;
    const y = plotTop + plotH - Math.min(1, s.forceN / safeMax) * plotH;
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
    if (s.forceN > maxForce) {
      maxForce = s.forceN;
      peakX = x;
      peakY = y;
    }
  }

  const baseY = (plotTop + plotH).toFixed(1);
  const endX = (plotLeft + plotW).toFixed(1);
  const lineD = pts.join(' ');
  const areaD = `${lineD} L${endX},${baseY} L${plotLeft.toFixed(1)},${baseY} Z`;
  return { lineD, areaD, peakX, peakY };
}

export const RecoilLabModal: React.FC<RecoilLabModalProps> = ({
  initialPresetId = 'vector_vs_thompson',
  initialWeaponA,
  initialWeaponB,
  onClose,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const lang = useAppStore((s) => s.lang);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const openSplitShowdown = useAppStore((s) => s.openSplitShowdown);
  const setSectionCut = useAppStore((s) => s.setSectionCut);

  const ui = RECOIL_LAB_STRINGS[lang];
  const initialPreset =
    RECOIL_MATCHUP_PRESETS.find((p) => p.id === initialPresetId) ??
    RECOIL_MATCHUP_PRESETS[0];

  const [activePresetId, setActivePresetId] = useState<RecoilPresetId | null>(
    initialWeaponA || initialWeaponB ? null : initialPreset.id
  );
  const [weaponA, setWeaponA] = useState<WeaponId>(
    initialWeaponA ?? initialPreset.weaponA
  );
  const [weaponB, setWeaponB] = useState<WeaponId>(
    initialWeaponB ?? initialPreset.weaponB
  );
  const [muzzleA, setMuzzleA] = useState<RecoilMuzzleOption>(
    initialPreset.muzzleA
  );
  const [muzzleB, setMuzzleB] = useState<RecoilMuzzleOption>(
    initialPreset.muzzleB
  );
  const [bufferA, setBufferA] = useState<boolean>(false);
  const [bufferB, setBufferB] = useState<boolean>(false);

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

  const resA = useMemo(
    () =>
      evaluateRecoilDynamics(weaponA, {
        muzzleDevice: muzzleA,
        bufferEnabled: bufferA,
      }),
    [weaponA, muzzleA, bufferA]
  );

  const resB = useMemo(
    () =>
      evaluateRecoilDynamics(weaponB, {
        muzzleDevice: muzzleB,
        bufferEnabled: bufferB,
      }),
    [weaponB, muzzleB, bufferB]
  );

  const labelA = getLocalizedShortWeaponLabel(weaponA, lang);
  const labelB = getLocalizedShortWeaponLabel(weaponB, lang);

  // Waveform geometry (640 x 210 SVG)
  const plotLeft = 48;
  const plotTop = 20;
  const plotW = 572;
  const plotH = 152;
  const peakHigh = Math.max(resA.peakFeltForceN, resB.peakFeltForceN, 1);
  const peakLow = Math.max(Math.min(resA.peakFeltForceN, resB.peakFeltForceN), 1);
  const crossScaleNormalized = peakHigh / peakLow > 5;

  const yMaxA = crossScaleNormalized ? resA.peakFeltForceN * 1.15 : peakHigh * 1.15;
  const yMaxB = crossScaleNormalized ? resB.peakFeltForceN * 1.15 : peakHigh * 1.15;

  const waveA = useMemo(
    () => buildWaveformPath(resA, yMaxA, plotLeft, plotTop, plotW, plotH),
    [resA, yMaxA]
  );
  const waveB = useMemo(
    () => buildWaveformPath(resB, yMaxB, plotLeft, plotTop, plotW, plotH),
    [resB, yMaxB]
  );

  const handleSelectPreset = (presetId: RecoilPresetId) => {
    const preset = RECOIL_MATCHUP_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    playWorkbenchFoley('preset_detent');
    setActivePresetId(preset.id);
    setWeaponA(preset.weaponA);
    setWeaponB(preset.weaponB);
    setMuzzleA(preset.muzzleA);
    setMuzzleB(preset.muzzleB);
    setBufferA(false);
    setBufferB(false);
  };

  const handleInspect = (id: WeaponId) => {
    playWorkbenchFoley('preset_detent');
    preloadWeaponPlugin(id);
    void preloadWeaponNarration(id);
    onClose();
    enterWorkbench(id);
  };

  const handleCompareSplit3d = () => {
    playWorkbenchFoley('preset_detent');
    preloadWeaponPlugin(weaponA);
    preloadWeaponPlugin(weaponB);
    void preloadWeaponNarration(weaponA);
    void preloadWeaponNarration(weaponB);
    onClose();
    openSplitShowdown(weaponA, weaponB);
    setSectionCut(true);
  };

  const muzzleOptionLabel = (opt: RecoilMuzzleOption): string => {
    switch (opt) {
      case 'raw':
        return ui.muzzleRaw;
      case 'factory':
        return ui.muzzleFactory;
      case 'brake':
        return ui.muzzleBrake;
      case 'suppressor':
        return ui.muzzleSuppressor;
      case 'flash_hider':
        return ui.muzzleFactory;
    }
  };

  const renderControlCard = (
    side: 'a' | 'b',
    weaponId: WeaponId,
    setWeapon: (id: WeaponId) => void,
    muzzle: RecoilMuzzleOption,
    setMuzzle: (m: RecoilMuzzleOption) => void,
    buffer: boolean,
    setBuffer: (v: boolean) => void,
    res: RecoilDynamicsResult,
    shortName: string
  ) => {
    const isArchery = res.profile.category === 'archery';
    return (
      <div
        className={`rl-control-card is-side-${side}`}
        data-testid={`recoil-card-${side}`}
      >
        <div className="rl-card-head">
          <span className="rl-side-dot" aria-hidden="true" />
          <span className="rl-side-label">
            {side === 'a' ? ui.sideALabel : ui.sideBLabel}
          </span>
          <button
            type="button"
            className="rl-inspect-mini"
            data-testid={`recoil-inspect-${side}`}
            onClick={() => handleInspect(weaponId)}
          >
            <Box size={11} aria-hidden="true" />
            <span>{ui.inspect3dBtn}</span>
          </button>
        </div>

        <div className="rl-select-row">
          <select
            className="rl-weapon-select"
            aria-label={side === 'a' ? ui.sideALabel : ui.sideBLabel}
            data-testid={`recoil-select-${side}`}
            value={weaponId}
            onChange={(e) => {
              setActivePresetId(null);
              setWeapon(e.target.value as WeaponId);
            }}
          >
            {RECOIL_EXHIBIT_PROFILES.map((p) => (
              <option key={p.weaponId} value={p.weaponId}>
                {p.bayCode} · {getLocalizedShortWeaponLabel(p.weaponId, lang)}
              </option>
            ))}
          </select>
          <span className="rl-mass-pill tabular">
            {res.profile.platformMassKg >= 1000
              ? `${(res.profile.platformMassKg / 1000).toFixed(1)} t`
              : `${res.profile.platformMassKg} kg`}
          </span>
        </div>

        <div className="rl-muzzle-row">
          <span className="rl-ctrl-label">{ui.muzzleLabel}:</span>
          <div className="rl-muzzle-pills" role="group" aria-label={ui.muzzleLabel}>
            {MUZZLE_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={isArchery && opt !== 'factory'}
                data-testid={`recoil-muzzle-${side}-${opt}`}
                className={`rl-pill-btn ${muzzle === opt ? 'active' : ''}`}
                aria-pressed={muzzle === opt}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setMuzzle(opt);
                }}
              >
                {muzzleOptionLabel(opt)}
              </button>
            ))}
          </div>
        </div>

        <label className="rl-buffer-toggle">
          <input
            type="checkbox"
            data-testid={`recoil-buffer-${side}`}
            checked={buffer}
            onChange={(e) => {
              playWorkbenchFoley('toggle_switch');
              setBuffer(e.target.checked);
            }}
          />
          <span>{ui.bufferToggle}</span>
        </label>

        {isArchery && (
          <p className="rl-archery-note">{ui.archeryZeroGasNote}</p>
        )}

        {/* 6 Quantitative Physics KPIs */}
        <div className="rl-kpi-grid" aria-label={shortName}>
          <div className="rl-kpi-cell">
            <span>{ui.kpiImpulse}</span>
            <strong className="tabular">{formatImpulse(res.totalImpulseNs)}</strong>
          </div>
          <div className="rl-kpi-cell">
            <span>{ui.kpiVelocity}</span>
            <strong className="tabular">
              {res.freeRecoilVelocityMps.toFixed(2)} m/s
            </strong>
          </div>
          <div className="rl-kpi-cell">
            <span>{ui.kpiEnergy}</span>
            <strong className="tabular">
              {formatRecoilEnergy(res.freeRecoilEnergyJ)}
            </strong>
          </div>
          <div className="rl-kpi-cell">
            <span>{ui.kpiPeakForce}</span>
            <strong className="tabular">
              {formatForceValue(res.peakFeltForceN)}
            </strong>
          </div>
          <div className="rl-kpi-cell">
            <span>{ui.kpiClimbTorque}</span>
            <strong className="tabular">
              {formatTorque(res.muzzleClimbTorqueNm)}
            </strong>
          </div>
          <div className="rl-kpi-cell">
            <span>{ui.kpiSustainedThrust}</span>
            <strong className="tabular">
              {res.sustainedThrustKn > 0
                ? `${res.sustainedThrustKn.toFixed(2)} kN`
                : ui.kpiSingleShot}
            </strong>
          </div>
        </div>
      </div>
    );
  };

  const renderMomentumBar = (
    side: 'a' | 'b',
    label: string,
    res: RecoilDynamicsResult
  ) => {
    const rawTotal = Math.max(
      1e-3,
      res.projectileMomentumNs + res.rawGasJetMomentumNs
    );
    const projPct = (res.projectileMomentumNs / rawTotal) * 100;
    const gasPct = (res.netGasJetMomentumNs / rawTotal) * 100;
    const savedPct = (res.muzzleCounterThrustNs / rawTotal) * 100;

    return (
      <div className={`rl-mom-row is-side-${side}`}>
        <div className="rl-mom-head">
          <strong>{label}</strong>
          <span className="tabular">
            {ui.momentumProj}: {formatImpulse(res.projectileMomentumNs)} ·{' '}
            {ui.momentumGas}: {formatImpulse(res.netGasJetMomentumNs)}
            {res.muzzleCounterThrustNs > 0
              ? ` · ${ui.momentumBrakeSaved}: -${formatImpulse(res.muzzleCounterThrustNs)}`
              : ''}
          </span>
        </div>
        <div className="rl-mom-track">
          <div
            className="rl-mom-seg is-proj"
            style={{ width: `${projPct.toFixed(2)}%` }}
          />
          <div
            className="rl-mom-seg is-gas"
            style={{ width: `${gasPct.toFixed(2)}%` }}
          />
          {savedPct > 0.2 && (
            <div
              className="rl-mom-seg is-saved"
              style={{ width: `${savedPct.toFixed(2)}%` }}
            />
          )}
        </div>
      </div>
    );
  };

  const renderLeverPanel = (
    offsetX: number,
    accent: string,
    label: string,
    res: RecoilDynamicsResult
  ) => {
    const pivotX = offsetX + 76;
    const pivotY = 128;
    const clampedBore = Math.max(10, Math.min(48, res.boreAxisMm));
    const leverPx = 18 + (clampedBore / 48) * 66;
    const boreY = pivotY - leverPx;
    const pivotLabel = ui.pivotLabels[res.profile.pivotKind];

    return (
      <g>
        <text
          x={offsetX + 14}
          y={20}
          fill={accent}
          fontSize="11"
          fontWeight="800"
        >
          {label}
        </text>
        <text
          x={offsetX + 278}
          y={20}
          textAnchor="end"
          fill="#cbd5e1"
          fontSize="10.5"
          fontFamily="monospace"
          fontWeight="700"
        >
          τ = {formatTorque(res.muzzleClimbTorqueNm)}
        </text>

        {/* Bore axis line & barrel representation */}
        <line
          x1={offsetX + 36}
          y1={boreY}
          x2={offsetX + 266}
          y2={boreY}
          stroke={accent}
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Rearward Recoil Force Vector Arrow */}
        <line
          x1={offsetX + 168}
          y1={boreY}
          x2={offsetX + 94}
          y2={boreY}
          stroke="#f43f5e"
          strokeWidth="2.5"
        />
        <polygon
          points={`${offsetX + 86},${boreY} ${offsetX + 98},${boreY - 5} ${offsetX + 98},${boreY + 5}`}
          fill="#f43f5e"
        />
        <text
          x={offsetX + 174}
          y={boreY - 6}
          fill="#fda4af"
          fontSize="9.5"
          fontFamily="monospace"
          fontWeight="700"
        >
          F = {formatForceValue(res.peakFeltForceN)}
        </text>

        {/* Vertical Bore-Height Lever Arm h_bore */}
        <line
          x1={pivotX}
          y1={boreY}
          x2={pivotX}
          y2={pivotY}
          stroke="#94a3b8"
          strokeWidth="1.4"
          strokeDasharray="3 2"
        />
        <text
          x={pivotX + 8}
          y={(boreY + pivotY) / 2 + 3}
          fill="#e2e8f0"
          fontSize="10"
          fontFamily="monospace"
          fontWeight="700"
        >
          h = {res.boreAxisMm} mm
        </text>

        {/* Curved Muzzle-Climb Rotation Arc */}
        <path
          d={`M ${offsetX + 236} ${boreY + 14} A 34 34 0 0 0 ${offsetX + 220} ${boreY - 14}`}
          fill="none"
          stroke={accent}
          strokeWidth="1.8"
          strokeDasharray="3 2"
        />
        <polygon
          points={`${offsetX + 216},${boreY - 18} ${offsetX + 226},${boreY - 15} ${offsetX + 220},${boreY - 8}`}
          fill={accent}
        />

        {/* Fulcrum Pivot Triangle */}
        <polygon
          points={`${pivotX},${pivotY} ${pivotX - 10},${pivotY + 15} ${pivotX + 10},${pivotY + 15}`}
          fill="rgba(56, 189, 248, 0.2)"
          stroke="#94a3b8"
          strokeWidth="1.4"
        />
        <circle cx={pivotX} cy={pivotY} r="3.5" fill={accent} />
        <text
          x={pivotX}
          y={pivotY + 29}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="9.5"
        >
          {pivotLabel}
        </text>
      </g>
    );
  };

  return (
    <dialog
      ref={dialogRef}
      className="recoillab-dialog"
      data-testid="recoil-lab-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="recoillab-shell">
        <header className="recoillab-header">
          <div className="rl-title-block">
            <span className="rl-kicker-badge">
              <Activity size={12} aria-hidden="true" />
              <span>{ui.kicker}</span>
            </span>
            <h2 id={titleId} className="rl-title">
              {ui.title}
            </h2>
            <p className="rl-subtitle">{ui.subtitle}</p>
          </div>
          <div className="rl-header-actions">
            <button
              type="button"
              className="rl-split-cta"
              data-testid="recoil-split3d-btn"
              onClick={handleCompareSplit3d}
            >
              <Columns2 size={14} aria-hidden="true" />
              <span>{ui.split3dBtn}</span>
            </button>
            <button
              type="button"
              className="rl-close-btn"
              aria-label={ui.closeAria}
              onClick={onClose}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* 5 Curated Recoil Matchup Presets */}
        <div
          className="rl-presets-bar"
          role="group"
          aria-label={ui.presetsLabel}
        >
          {RECOIL_MATCHUP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`recoil-preset-${preset.id}`}
              className={`rl-preset-pill ${activePresetId === preset.id ? 'active' : ''}`}
              aria-pressed={activePresetId === preset.id}
              onClick={() => handleSelectPreset(preset.id)}
            >
              <strong>{lang === 'zh' ? preset.titleZh : preset.titleEn}</strong>
              <span>{lang === 'zh' ? preset.insightZh : preset.insightEn}</span>
            </button>
          ))}
        </div>

        <div className="recoillab-body">
          {/* Dual Control & Telemetry Cards */}
          <div className="rl-dual-controls">
            {renderControlCard(
              'a',
              weaponA,
              setWeaponA,
              muzzleA,
              setMuzzleA,
              bufferA,
              setBufferA,
              resA,
              labelA
            )}
            {renderControlCard(
              'b',
              weaponB,
              setWeaponB,
              muzzleB,
              setMuzzleB,
              bufferB,
              setBufferB,
              resB,
              labelB
            )}
          </div>

          <p className="rl-buffer-note">
            <Shield size={12} aria-hidden="true" />
            <span>{ui.bufferHint}</span>
          </p>

          {/* Visualizations Grid: F(t) Waveform + Bore-Axis Lever Diagram */}
          <div className="rl-viz-grid">
            {/* Dual-Channel 120-Point F(t) Waveform */}
            <section className="rl-viz-card">
              <div className="rl-viz-head">
                <div className="rl-viz-title">
                  <Gauge size={13} aria-hidden="true" />
                  <h3>{ui.waveformHeading}</h3>
                </div>
                <p>{ui.waveformSub}</p>
                {crossScaleNormalized && (
                  <span className="rl-norm-badge">
                    {ui.waveformNormalizedNote}
                  </span>
                )}
              </div>

              <svg
                viewBox="0 0 640 205"
                className="rl-svg-chart"
                data-testid="recoil-waveform-svg"
                role="img"
                aria-label={ui.waveformHeading}
              >
                {/* Horizontal gridlines */}
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                  const y = plotTop + plotH * (1 - frac);
                  return (
                    <line
                      key={frac}
                      x1={plotLeft}
                      y1={y}
                      x2={plotLeft + plotW}
                      y2={y}
                      stroke="rgba(148, 163, 184, 0.16)"
                      strokeDasharray={frac === 0 ? undefined : '3 3'}
                    />
                  );
                })}
                {/* Vertical time ticks 0..40 ms */}
                {[0, 10, 20, 30, 40].map((ms) => {
                  const x = plotLeft + (ms / RECOIL_WAVEFORM_WINDOW_MS) * plotW;
                  return (
                    <g key={ms}>
                      <line
                        x1={x}
                        y1={plotTop}
                        x2={x}
                        y2={plotTop + plotH}
                        stroke="rgba(148, 163, 184, 0.14)"
                      />
                      <text
                        x={x}
                        y={plotTop + plotH + 16}
                        textAnchor="middle"
                        fill="#94a3b8"
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {ms} ms
                      </text>
                    </g>
                  );
                })}

                {/* Impulse Area Shading */}
                <path d={waveA.areaD} fill="rgba(56, 189, 248, 0.16)" />
                <path d={waveB.areaD} fill="rgba(251, 191, 36, 0.15)" />

                {/* F(t) Force Traces */}
                <path
                  d={waveA.lineD}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                />
                <path
                  d={waveB.lineD}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                />

                {/* Peak Markers */}
                <circle
                  cx={waveA.peakX}
                  cy={waveA.peakY}
                  r="4"
                  fill="#38bdf8"
                  stroke="#0f172a"
                  strokeWidth="1.5"
                />
                <circle
                  cx={waveB.peakX}
                  cy={waveB.peakY}
                  r="4"
                  fill="#fbbf24"
                  stroke="#0f172a"
                  strokeWidth="1.5"
                />

                {/* Inline Legend */}
                <text
                  x={plotLeft + plotW}
                  y={14}
                  textAnchor="end"
                  fill="#38bdf8"
                  fontSize="10.5"
                  fontFamily="monospace"
                  fontWeight="700"
                >
                  A: {labelA} ({formatForceValue(resA.peakFeltForceN)})
                </text>
                <text
                  x={plotLeft + plotW}
                  y={28}
                  textAnchor="end"
                  fill="#fbbf24"
                  fontSize="10.5"
                  fontFamily="monospace"
                  fontWeight="700"
                >
                  B: {labelB} ({formatForceValue(resB.peakFeltForceN)})
                </text>
              </svg>
            </section>

            {/* Interactive Bore-Axis Muzzle-Climb Lever Diagram SVG */}
            <section className="rl-viz-card">
              <div className="rl-viz-head">
                <div className="rl-viz-title">
                  <SlidersHorizontal size={13} aria-hidden="true" />
                  <h3>{ui.leverHeading}</h3>
                </div>
                <p>{ui.leverSub}</p>
              </div>

              <svg
                viewBox="0 0 600 170"
                className="rl-svg-chart"
                data-testid="recoil-lever-svg"
                role="img"
                aria-label={ui.leverHeading}
              >
                <line
                  x1="300"
                  y1="10"
                  x2="300"
                  y2="160"
                  stroke="rgba(148, 163, 184, 0.22)"
                  strokeDasharray="4 3"
                />
                {renderLeverPanel(0, '#38bdf8', labelA, resA)}
                {renderLeverPanel(300, '#fbbf24', labelB, resB)}
              </svg>
            </section>
          </div>

          {/* Stacked Momentum Decomposition Bars */}
          <section
            className="rl-momentum-panel"
            data-testid="recoil-momentum-bars"
          >
            <div className="rl-viz-head">
              <div className="rl-viz-title">
                <Flame size={13} aria-hidden="true" />
                <h3>{ui.momentumHeading}</h3>
              </div>
              <div className="rl-mom-legend">
                <span>
                  <i className="rl-swatch is-proj" /> {ui.momentumProj}
                </span>
                <span>
                  <i className="rl-swatch is-gas" /> {ui.momentumGas}
                </span>
                <span>
                  <i className="rl-swatch is-saved" /> {ui.momentumBrakeSaved}
                </span>
              </div>
            </div>

            {renderMomentumBar('a', labelA, resA)}
            {renderMomentumBar('b', labelB, resB)}
          </section>
        </div>
      </div>
    </dialog>
  );
};

export default RecoilLabModal;
