import React, { useEffect, useRef } from 'react';
import { Flame, Layers, Pause, Play, Repeat, Zap } from 'lucide-react';
import {
  playbackClock,
  useActiveFiringPhase,
  useActiveTimelinePresetId,
} from '../../engine/clock/playbackClock';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { useWeaponPlugin } from '../../weapons/registry';
import type {
  FiringPhaseInfo,
  TimelinePresetItem,
} from '../../weapons/types';

const EMPTY_PRESETS: readonly TimelinePresetItem[] = [];
const EMPTY_PHASES: readonly FiringPhaseInfo[] = [];

const SPEED_OPTIONS: { value: 0.25 | 0.5 | 1.0; label: string }[] = [
  { value: 0.25, label: '0.25x 超慢' },
  { value: 0.5, label: '0.5x 慢放' },
  { value: 1.0, label: '1.0x 标准' },
];

export const TimelineDock: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
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

  const manifest = getWeaponManifest(activeWeaponId);
  const meta = manifest.workbenchMeta;
  const plugin = useWeaponPlugin(activeWeaponId);
  const timelinePresets = plugin?.timelinePresets ?? EMPTY_PRESETS;
  const firingPhases = plugin?.firingPhases ?? EMPTY_PHASES;

  const activePresetId = useActiveTimelinePresetId(timelinePresets);
  const activePhase = useActiveFiringPhase(firingPhases);

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
            <span>结构爆炸拆解模式</span>
          </button>
          <button
            className={`mode-tab ${mode === 'firing' ? 'active-firing' : ''}`}
            onClick={() => setMode('firing')}
          >
            <Flame size={14} />
            <span>子弹动态发射流程演示</span>
          </button>
        </div>

        {mode === 'firing' && (
          <div className="firing-sub-controls">
            <div className="speed-group">
              {SPEED_OPTIONS.map((sp) => (
                <button
                  key={sp.value}
                  className={`speed-pill ${
                    fireSpeedMultiplier === sp.value ? 'active' : ''
                  }`}
                  onClick={() => setFireSpeedMultiplier(sp.value)}
                >
                  {sp.label}
                </button>
              ))}
            </div>

            <button
              className={`loop-pill ${fireLoop ? 'active' : ''}`}
              onClick={toggleFireLoop}
              title="切换连续循环击发或单发停止"
            >
              <Repeat size={12} />
              <span>{fireLoop ? '连续循环' : '单发停止'}</span>
            </button>
          </div>
        )}
      </div>

      {mode === 'explode' ? (
        <div key="explode-dock-body">
          <div className="timeline-presets">
            {timelinePresets.map((preset) => {
              const isActive = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  className={`preset-pill ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    stopPlay();
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
                  title={preset.desc}
                >
                  <span className="preset-name">{preset.label}</span>
                  <span className="preset-pct">{preset.subLabel}</span>
                </button>
              );
            })}
          </div>

          <div className="timeline-scrubber-row">
            <button
              className={`play-btn ${isPlaying ? 'playing' : ''}`}
              onClick={togglePlay}
              title={
                isPlaying
                  ? '暂停自动拆解 (Space)'
                  : '自动播放分阶段拆解动画 (Space)'
              }
            >
              {isPlaying ? <Pause size={15} /> : <Play size={15} />}
              <span>{isPlaying ? '暂停' : '自动拆解'}</span>
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
                <span style={{ left: '0%' }}>0% 合拢</span>
                <span style={{ left: '30%' }}>30% 一级快拆</span>
                <span style={{ left: '65%' }}>65% 二级分解</span>
                <span style={{ left: '100%' }}>100% 全爆炸</span>
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
              return (
                <button
                  key={ph.id}
                  className={`phase-step-pill ${isCurrent ? 'active' : ''}`}
                  onClick={() => {
                    stopFiringPlay();
                    const mid =
                      ph.range[0] + (ph.range[1] - ph.range[0]) * 0.62;
                    setFireProgress(mid);
                  }}
                  title={ph.title}
                >
                  <span className="phase-num">{ph.stepNum}</span>
                  <span className="phase-text">{ph.shortLabel}</span>
                </button>
              );
            })}
          </div>

          <div className="timeline-scrubber-row">
            <button
              className="single-shot-btn"
              onClick={triggerSingleShot}
              title="从 0% 重新扣动扳机完整演示一次单发射击循环"
            >
              <Zap size={14} />
              <span>扣扳机单发</span>
            </button>

            <button
              className={`play-btn fire-play-btn ${
                isFiringPlaying ? 'playing' : ''
              }`}
              onClick={toggleFiringPlay}
              title="播放或暂停发射循环演示 (Space)"
            >
              {isFiringPlaying ? <Pause size={15} /> : <Play size={15} />}
              <span>{isFiringPlaying ? '暂停' : '继续演示'}</span>
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
                  setFireProgress(Number(e.target.value) / 1000);
                }}
                className="explode-slider firing-slider"
              />
              <div className="stage-ticks">
                <span style={{ left: '0%' }}>待击</span>
                <span style={{ left: '22%' }}>底火击发</span>
                <span style={{ left: '34%' }}>
                  {meta.firingMilestoneLabel ?? '出膛/开锁'}
                </span>
                <span style={{ left: '54%' }}>后坐抛壳</span>
                <span style={{ left: '78%' }}>推弹闭锁</span>
                <span style={{ left: '100%' }}>复位</span>
              </div>
            </div>

            <div ref={pctRef} className="pct-readout fire-readout" />
          </div>
        </div>
      )}
    </div>
  );
};
