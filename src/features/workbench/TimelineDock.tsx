import React, { useEffect, useRef } from 'react';
import {
  Activity,
  Crosshair,
  Flame,
  Layers,
  Pause,
  Play,
  Repeat,
  ShieldAlert,
  Volume2,
  VolumeX,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  playWorkbenchFoley,
  triggerManualPhasePreviewSound,
} from '../../engine/audio/mechanicalSoundEngine';
import {
  playbackClock,
  useActiveFiringPhase,
  useActiveTimelinePresetId,
} from '../../engine/clock/playbackClock';
import {
  getSelectorModeMetadata,
  getSupportedSelectorModes,
  interactiveActionStore,
  pressInteractiveTrigger,
  releaseInteractiveTrigger,
  setFireSelectorMode,
  togglePressCheck,
  useInteractiveActionStore,
} from '../../engine/interaction/InteractiveActionController';
import { isArcheryWeapon } from '../../engine/physics/armoryPhysics';
import { UI_STRINGS } from '../../i18n/uiStrings';
import {
  resolveFiringPhaseText,
  resolveTimelinePresetText,
  resolveWeaponDisplayMeta,
} from '../../i18n/weaponFallbacks';
import { useWeaponNarration } from '../../narration/narrationService';
import { useAppStore } from '../../store/useAppStore';
import { useWeaponPlugin } from '../../weapons/registry';
import type { FiringPhaseInfo, TimelinePresetItem } from '../../weapons/types';
import { FieldStripHud } from './FieldStripHud';
import { MalfunctionHud } from './MalfunctionHud';

const EMPTY_PRESETS: readonly TimelinePresetItem[] = [];
const EMPTY_PHASES: readonly FiringPhaseInfo[] = [];

const SPEED_VALUES: readonly (0.25 | 0.5 | 1.0)[] = [0.25, 0.5, 1.0];

export const TimelineDock: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);

  // Disassembly playback controls
  const isPlaying = useAppStore((s) => s.isPlaying);
  const setTargetProgress = useAppStore((s) => s.setTargetProgress);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const stopPlay = useAppStore((s) => s.stopPlay);
  const triggerCameraPreset = useAppStore((s) => s.triggerCameraPreset);

  // Firing simulation controls
  const isFiringPlaying = useAppStore((s) => s.isFiringPlaying);
  const fireLoop = useAppStore((s) => s.fireLoop);
  const fireSpeedMultiplier = useAppStore((s) => s.fireSpeedMultiplier);
  const setFireProgress = useAppStore((s) => s.setFireProgress);
  const toggleFiringPlay = useAppStore((s) => s.toggleFiringPlay);
  const stopFiringPlay = useAppStore((s) => s.stopFiringPlay);
  const triggerSingleShot = useAppStore((s) => s.triggerSingleShot);
  const toggleFireLoop = useAppStore((s) => s.toggleFireLoop);
  const setFireSpeedMultiplier = useAppStore((s) => s.setFireSpeedMultiplier);
  const sfxMuted = useAppStore((s) => s.sfxMuted);
  const toggleSfxMuted = useAppStore((s) => s.toggleSfxMuted);
  const telemetryHudOpen = useAppStore((s) => s.telemetryHudOpen);
  const toggleTelemetryHud = useAppStore((s) => s.toggleTelemetryHud);
  const gasFlowVisible = useAppStore((s) => s.gasFlowVisible);
  const toggleGasFlowVisible = useAppStore((s) => s.toggleGasFlowVisible);
  const fieldStripActive = useAppStore((s) => s.fieldStripActive);
  const setFieldStripActive = useAppStore((s) => s.setFieldStripActive);
  const malfunctionActive = useAppStore((s) => s.malfunctionActive);
  const setMalfunctionActive = useAppStore((s) => s.setMalfunctionActive);

  // Hands-on 3D Fire-Control Group (FCG) & Press-Check state
  const actionSnap = useInteractiveActionStore();
  const supportedSelectorModes = getSupportedSelectorModes(activeWeaponId);

  const plugin = useWeaponPlugin(activeWeaponId);
  const { bundle } = useWeaponNarration(activeWeaponId);
  const timelinePresets = plugin?.timelinePresets ?? EMPTY_PRESETS;
  const firingPhases = plugin?.firingPhases ?? EMPTY_PHASES;

  const activePresetId = useActiveTimelinePresetId(timelinePresets);
  const activePhase = useActiveFiringPhase(firingPhases);

  const rawUi = UI_STRINGS[lang].timeline;
  const ui = isArcheryWeapon(activeWeaponId)
    ? { ...rawUi, ...rawUi.archery }
    : rawUi;
  const displayMeta = resolveWeaponDisplayMeta(activeWeaponId, lang, bundle);

  const sliderRef = useRef<HTMLInputElement>(null);
  const pctRef = useRef<HTMLDivElement>(null);
  const selectorGroupRef = useRef<HTMLDivElement>(null);
  const holdTriggerBtnRef = useRef<HTMLButtonElement>(null);
  const prevSafetyBlockedRef = useRef<number>(actionSnap.safetyBlockedSeq);

  // Flash SAFE selector & trigger button amber/crimson when trigger is pulled on SAFE (0 React state churn)
  useEffect(() => {
    if (actionSnap.safetyBlockedSeq === prevSafetyBlockedRef.current) {
      return;
    }
    prevSafetyBlockedRef.current = actionSnap.safetyBlockedSeq;
    if (actionSnap.safetyBlockedSeq <= 0) return;

    const targets = [selectorGroupRef.current, holdTriggerBtnRef.current];
    for (const el of targets) {
      if (!el) continue;
      el.classList.remove('is-safe-blocked');
      void el.offsetWidth;
      el.classList.add('is-safe-blocked');
    }
    const timer = window.setTimeout(() => {
      for (const el of targets) {
        el?.classList.remove('is-safe-blocked');
      }
    }, 620);
    return () => window.clearTimeout(timer);
  }, [actionSnap.safetyBlockedSeq]);

  // Imperatively sync 60fps progress into range slider & percentage label (0 React re-renders)
  useEffect(() => {
    const syncDom = (scalar: number) => {
      if (sliderRef.current) {
        sliderRef.current.value = String(Math.round(scalar * 1000));
      }
      if (pctRef.current) {
        pctRef.current.textContent = `${Math.round(scalar * 100)}%`;
      }
    };

    const snap = playbackClock.getState();
    if (mode === 'explode') {
      syncDom(snap.targetProgress);
      return playbackClock.subscribeExplodeProgress(syncDom);
    }
    syncDom(snap.fireProgress);
    return playbackClock.subscribeFireProgress(syncDom);
  }, [mode, fieldStripActive, activeWeaponId]);

  const initialScalar =
    mode === 'explode'
      ? playbackClock.getState().targetProgress
      : playbackClock.getState().fireProgress;

  return (
    <div className="timeline-dock">
      {/* Mode Switcher Header Row */}
      <div className="dock-mode-bar">
        <div className="mode-tabs">
          <button
            type="button"
            className={`mode-tab ${
              mode === 'explode' && !fieldStripActive ? 'active-explode' : ''
            }`}
            aria-pressed={mode === 'explode' && !fieldStripActive}
            onClick={() => {
              if (fieldStripActive) setFieldStripActive(false);
              setMode('explode');
            }}
          >
            <Layers size={14} aria-hidden="true" />
            <span>{ui.modeExplode}</span>
          </button>
          <button
            type="button"
            className={`mode-tab ${
              mode === 'explode' && fieldStripActive ? 'active-fieldstrip' : ''
            }`}
            aria-pressed={mode === 'explode' && fieldStripActive}
            onClick={() =>
              setFieldStripActive(!(mode === 'explode' && fieldStripActive))
            }
          >
            <Wrench size={14} aria-hidden="true" />
            <span>{ui.modeFieldStrip}</span>
          </button>
          <button
            type="button"
            className={`mode-tab ${
              mode === 'firing' && !malfunctionActive ? 'active-firing' : ''
            }`}
            aria-pressed={mode === 'firing' && !malfunctionActive}
            onClick={() => setMode('firing')}
          >
            <Flame size={14} aria-hidden="true" />
            <span>{ui.modeFiring}</span>
          </button>
          <button
            type="button"
            className={`mode-tab ${
              malfunctionActive ? 'active-malfunction' : ''
            }`}
            aria-pressed={malfunctionActive}
            onClick={() => setMalfunctionActive(!malfunctionActive)}
          >
            <ShieldAlert size={14} aria-hidden="true" />
            <span>{ui.modeMalfunction}</span>
          </button>
        </div>

        {mode === 'firing' && !malfunctionActive && (
          <div className="firing-sub-controls">
            <div
              ref={selectorGroupRef}
              className="fcg-selector-group"
              role="group"
              aria-label={ui.selectorGroupAria}
            >
              {supportedSelectorModes.map((selMode) => {
                const isActive = actionSnap.selectorMode === selMode;
                const selMeta = getSelectorModeMetadata(
                  activeWeaponId,
                  selMode
                );
                const tooltip = selMeta
                  ? lang === 'zh'
                    ? `${selMeta.labelZh} — ${selMeta.tooltipZh}`
                    : `${selMeta.labelEn} — ${selMeta.tooltipEn}`
                  : ui.selectorGroupAria;
                return (
                  <button
                    key={selMode}
                    type="button"
                    className={`fcg-pill mode-${selMode} ${
                      isActive ? 'active' : ''
                    }`}
                    aria-pressed={isActive}
                    title={tooltip}
                    onClick={() => setFireSelectorMode(selMode)}
                  >
                    <span>{ui.selectorShort[selMode]}</span>
                  </button>
                );
              })}
            </div>

            <div className="speed-group">
              {SPEED_VALUES.map((val) => {
                const key = String(val) as '0.25' | '0.5' | '1';
                return (
                  <button
                    key={val}
                    className={`speed-pill ${
                      fireSpeedMultiplier === val ? 'active' : ''
                    }`}
                    onClick={() => setFireSpeedMultiplier(val)}
                  >
                    {ui.speeds[key]}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className={`loop-pill ${fireLoop ? 'active' : ''}`}
              onClick={toggleFireLoop}
              title={ui.loopTitle}
            >
              <Repeat size={12} aria-hidden="true" />
              <span>{fireLoop ? ui.loopOn : ui.loopOff}</span>
            </button>

            <button
              type="button"
              className={`loop-pill hud-pill ${telemetryHudOpen ? 'active' : ''}`}
              aria-pressed={telemetryHudOpen}
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                toggleTelemetryHud();
              }}
              title={ui.hudTitle(telemetryHudOpen)}
            >
              <Activity size={12} aria-hidden="true" />
              <span>{ui.hudPill}</span>
            </button>

            <button
              type="button"
              className={`loop-pill gas-pill ${gasFlowVisible ? 'active' : ''}`}
              aria-pressed={gasFlowVisible}
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                toggleGasFlowVisible();
              }}
              title={ui.gasFlowTitle}
            >
              <Wind size={12} aria-hidden="true" />
              <span>{ui.gasFlowPill}</span>
            </button>

            <button
              type="button"
              className={`loop-pill ${!sfxMuted ? 'active' : ''}`}
              aria-pressed={!sfxMuted}
              onClick={toggleSfxMuted}
              title={ui.sfxTitle}
            >
              {sfxMuted ? (
                <VolumeX size={12} aria-hidden="true" />
              ) : (
                <Volume2 size={12} aria-hidden="true" />
              )}
              <span>{ui.sfxPill}</span>
            </button>
          </div>
        )}
      </div>

      {malfunctionActive ? (
        <MalfunctionHud key="malfunction-dock-body" />
      ) : mode === 'explode' && fieldStripActive ? (
        <FieldStripHud key="field-strip-dock-body" />
      ) : mode === 'explode' ? (
        <div key="explode-dock-body">
          <div className="timeline-presets">
            {timelinePresets.map((preset) => {
              const isActive = activePresetId === preset.id;
              const locPreset = resolveTimelinePresetText(preset, lang, bundle);
              return (
                <button
                  key={preset.id}
                  className={`preset-pill ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    stopPlay();
                    playWorkbenchFoley('preset_detent');
                    setTargetProgress(preset.t);
                    const state = useAppStore.getState();
                    if (!state.selectedPartId) {
                      const curPreset = state.cameraCommand.preset;
                      triggerCameraPreset(
                        curPreset === 'cutaway_focus' ||
                          curPreset === 'firing_view'
                          ? 'iso'
                          : curPreset
                      );
                    }
                  }}
                  title={locPreset.desc}
                >
                  <span className="preset-name">{locPreset.label}</span>
                  <span className="preset-pct">{locPreset.subLabel}</span>
                </button>
              );
            })}
          </div>

          <div className="timeline-scrubber-row">
            <button
              className={`play-btn ${isPlaying ? 'playing' : ''}`}
              onClick={togglePlay}
              title={ui.playExplodeTitle(isPlaying)}
            >
              {isPlaying ? <Pause size={15} /> : <Play size={15} />}
              <span>{isPlaying ? ui.pause : ui.autoExplode}</span>
            </button>

            <div className="slider-wrapper">
              <input
                key="explode-slider"
                ref={sliderRef}
                type="range"
                min={0}
                max={1000}
                defaultValue={Math.round(initialScalar * 1000)}
                onChange={(e) => {
                  stopPlay();
                  setTargetProgress(Number(e.target.value) / 1000);
                }}
                className="explode-slider"
              />
              <div className="stage-ticks">
                <span>{ui.ticksExplode[0]}</span>
                <span>{ui.ticksExplode[1]}</span>
                <span>{ui.ticksExplode[2]}</span>
                <span>{ui.ticksExplode[3]}</span>
              </div>
            </div>

            <div ref={pctRef} className="pct-readout" />
          </div>
        </div>
      ) : (
        <div key="firing-dock-body">
          {/* 7-Phase Firing Cycle Interactive Stepper */}
          <div className="firing-phases-grid">
            {firingPhases.map((ph) => {
              const isCurrent = activePhase?.id === ph.id;
              const locPhase = resolveFiringPhaseText(ph, lang, bundle);
              return (
                <button
                  key={ph.id}
                  className={`phase-step-pill ${isCurrent ? 'active' : ''}`}
                  onClick={() => {
                    stopFiringPlay();
                    const mid =
                      ph.range[0] + (ph.range[1] - ph.range[0]) * 0.62;
                    setFireProgress(mid);
                    triggerManualPhasePreviewSound(activeWeaponId, mid);
                  }}
                  title={locPhase.title}
                >
                  <span className="phase-num">{ph.stepNum}</span>
                  <span className="phase-text">{locPhase.shortLabel}</span>
                </button>
              );
            })}
          </div>

          <div className="timeline-scrubber-row">
            <button
              type="button"
              className={`press-check-btn ${
                actionSnap.isPressCheck ? 'active' : ''
              }`}
              aria-pressed={actionSnap.isPressCheck}
              onClick={() => togglePressCheck()}
              title={ui.pressCheckTitle}
            >
              <Crosshair size={13} aria-hidden="true" />
              <span>
                {actionSnap.isPressCheck
                  ? ui.pressCheckActiveBtn
                  : ui.pressCheckBtn}
              </span>
            </button>

            <button
              ref={holdTriggerBtnRef}
              type="button"
              className={`hold-trigger-btn ${
                actionSnap.isTriggerHeld ? 'is-held' : ''
              } ${
                actionSnap.selectorMode === 'safe' ? 'is-safe-mode' : ''
              } ${
                actionSnap.awaitingDisconnectorReset ? 'is-awaiting-reset' : ''
              }`}
              title={ui.holdTriggerTitle}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                pressInteractiveTrigger();
              }}
              onPointerUp={() => releaseInteractiveTrigger()}
              onPointerCancel={() => releaseInteractiveTrigger()}
              onLostPointerCapture={() => releaseInteractiveTrigger()}
              onPointerLeave={() => {
                if (interactiveActionStore.getState().isTriggerHeld) {
                  releaseInteractiveTrigger();
                }
              }}
            >
              {actionSnap.selectorMode === 'safe' ? (
                <ShieldAlert size={13} aria-hidden="true" />
              ) : (
                <Flame size={13} aria-hidden="true" />
              )}
              <span>
                {actionSnap.selectorMode === 'safe'
                  ? ui.holdTriggerSafeBtn
                  : actionSnap.awaitingDisconnectorReset
                    ? ui.holdTriggerResetBtn
                    : ui.holdTriggerBtn}
              </span>
            </button>

            <button
              className="single-shot-btn"
              onClick={triggerSingleShot}
              title={ui.singleShotTitle}
            >
              <Zap size={14} />
              <span>{ui.singleShot}</span>
            </button>

            <button
              className={`play-btn fire-play-btn ${
                isFiringPlaying ? 'playing' : ''
              }`}
              onClick={toggleFiringPlay}
              title={ui.firingPlayTitle}
            >
              {isFiringPlaying ? <Pause size={15} /> : <Play size={15} />}
              <span>{isFiringPlaying ? ui.pause : ui.resumeFiring}</span>
            </button>

            <div className="slider-wrapper">
              <input
                key="firing-slider"
                ref={sliderRef}
                type="range"
                min={0}
                max={1000}
                defaultValue={Math.round(initialScalar * 1000)}
                onChange={(e) => {
                  stopFiringPlay();
                  const nextVal = Number(e.target.value) / 1000;
                  setFireProgress(nextVal);
                  triggerManualPhasePreviewSound(activeWeaponId, nextVal);
                }}
                className="explode-slider firing-slider"
              />
              <div className="stage-ticks firing-stage-ticks">
                <span>{ui.ticksFiring.cocked}</span>
                <span className="tick-optional">{ui.ticksFiring.ignition}</span>
                <span className="tick-milestone">
                  {displayMeta.firingMilestoneLabel ||
                    ui.ticksFiring.unlockFallback}
                </span>
                <span>{ui.ticksFiring.eject}</span>
                <span>{ui.ticksFiring.feedLock}</span>
                <span>{ui.ticksFiring.reset}</span>
              </div>
            </div>

            <div ref={pctRef} className="pct-readout fire-readout" />
          </div>
        </div>
      )}
    </div>
  );
};
