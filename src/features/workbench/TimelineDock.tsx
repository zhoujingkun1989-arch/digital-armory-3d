import React, { useEffect, useRef } from 'react';
import {
  Flame,
  Layers,
  Pause,
  Play,
  Repeat,
  Volume2,
  VolumeX,
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

  const plugin = useWeaponPlugin(activeWeaponId);
  const { bundle } = useWeaponNarration(activeWeaponId);
  const timelinePresets = plugin?.timelinePresets ?? EMPTY_PRESETS;
  const firingPhases = plugin?.firingPhases ?? EMPTY_PHASES;

  const activePresetId = useActiveTimelinePresetId(timelinePresets);
  const activePhase = useActiveFiringPhase(firingPhases);

  const ui = UI_STRINGS[lang].timeline;
  const displayMeta = resolveWeaponDisplayMeta(activeWeaponId, lang, bundle);

  const sliderRef = useRef<HTMLInputElement>(null);
  const pctRef = useRef<HTMLDivElement>(null);

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
  }, [mode, activeWeaponId]);

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
            className={`mode-tab ${mode === 'explode' ? 'active-explode' : ''}`}
            onClick={() => setMode('explode')}
          >
            <Layers size={14} />
            <span>{ui.modeExplode}</span>
          </button>
          <button
            className={`mode-tab ${mode === 'firing' ? 'active-firing' : ''}`}
            onClick={() => setMode('firing')}
          >
            <Flame size={14} />
            <span>{ui.modeFiring}</span>
          </button>
        </div>

        {mode === 'firing' && (
          <div className="firing-sub-controls">
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

      {mode === 'explode' ? (
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
                <span style={{ left: '0%' }}>{ui.ticksExplode[0]}</span>
                <span style={{ left: '30%' }}>{ui.ticksExplode[1]}</span>
                <span style={{ left: '65%' }}>{ui.ticksExplode[2]}</span>
                <span style={{ left: '100%' }}>{ui.ticksExplode[3]}</span>
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
              <div className="stage-ticks">
                <span style={{ left: '0%' }}>{ui.ticksFiring.cocked}</span>
                <span style={{ left: '22%' }}>{ui.ticksFiring.ignition}</span>
                <span style={{ left: '34%' }}>
                  {displayMeta.firingMilestoneLabel ||
                    ui.ticksFiring.unlockFallback}
                </span>
                <span style={{ left: '54%' }}>{ui.ticksFiring.eject}</span>
                <span style={{ left: '78%' }}>{ui.ticksFiring.feedLock}</span>
                <span style={{ left: '100%' }}>{ui.ticksFiring.reset}</span>
              </div>
            </div>

            <div ref={pctRef} className="pct-readout fire-readout" />
          </div>
        </div>
      )}
    </div>
  );
};
