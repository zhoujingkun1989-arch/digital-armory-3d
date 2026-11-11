import React from 'react';
import {
  Flame,
  Layers,
  Pause,
  Play,
  Repeat,
  Zap,
} from 'lucide-react';
import {
  getWeaponActiveFiringPhase,
  getWeaponFiringPhases,
  getWeaponTimelinePresets,
} from '../data/weaponRegistry';
import { useExplodeStore } from '../store/useExplodeStore';

const SPEED_OPTIONS: { value: 0.25 | 0.5 | 1.0; label: string }[] = [
  { value: 0.25, label: '0.25x 超慢' },
  { value: 0.5, label: '0.5x 慢放' },
  { value: 1.0, label: '1.0x 标准' },
];

export const TimelineBar: React.FC = () => {
  const activeWeaponId = useExplodeStore((s) => s.activeWeaponId);
  const mode = useExplodeStore((s) => s.mode);
  const setMode = useExplodeStore((s) => s.setMode);

  // Disassembly state
  const targetProgress = useExplodeStore((s) => s.targetProgress);
  const isPlaying = useExplodeStore((s) => s.isPlaying);
  const setTargetProgress = useExplodeStore((s) => s.setTargetProgress);
  const togglePlay = useExplodeStore((s) => s.togglePlay);
  const stopPlay = useExplodeStore((s) => s.stopPlay);
  const triggerCameraPreset = useExplodeStore((s) => s.triggerCameraPreset);

  // Firing state
  const fireProgress = useExplodeStore((s) => s.fireProgress);
  const isFiringPlaying = useExplodeStore((s) => s.isFiringPlaying);
  const fireLoop = useExplodeStore((s) => s.fireLoop);
  const fireSpeedMultiplier = useExplodeStore((s) => s.fireSpeedMultiplier);
  const setFireProgress = useExplodeStore((s) => s.setFireProgress);
  const toggleFiringPlay = useExplodeStore((s) => s.toggleFiringPlay);
  const stopFiringPlay = useExplodeStore((s) => s.stopFiringPlay);
  const triggerSingleShot = useExplodeStore((s) => s.triggerSingleShot);
  const toggleFireLoop = useExplodeStore((s) => s.toggleFireLoop);
  const setFireSpeedMultiplier = useExplodeStore(
    (s) => s.setFireSpeedMultiplier
  );

  const timelinePresets = getWeaponTimelinePresets(activeWeaponId);
  const firingPhases = getWeaponFiringPhases(activeWeaponId);
  const activePhase = getWeaponActiveFiringPhase(activeWeaponId, fireProgress);

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
        <>
          <div className="timeline-presets">
            {timelinePresets.map((preset) => {
              const isActive = Math.abs(targetProgress - preset.t) < 0.03;
              return (
                <button
                  key={preset.id}
                  className={`preset-pill ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    stopPlay();
                    setTargetProgress(preset.t);
                    if (!useExplodeStore.getState().selectedPartId) {
                      const curPreset =
                        useExplodeStore.getState().cameraCommand.preset;
                      triggerCameraPreset(
                        curPreset === 'safe_action' ||
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
              title={isPlaying ? '暂停自动拆解' : '自动播放分阶段拆解动画'}
            >
              {isPlaying ? <Pause size={15} /> : <Play size={15} />}
              <span>{isPlaying ? '暂停' : '自动拆解'}</span>
            </button>

            <div className="slider-wrapper">
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(targetProgress * 1000)}
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

            <div className="pct-readout">
              {Math.round(targetProgress * 100)}%
            </div>
          </div>
        </>
      ) : (
        <>
          {/* 7-Phase Firing Cycle Interactive Stepper */}
          <div className="firing-phases-grid">
            {firingPhases.map((ph) => {
              const isCurrent = activePhase.id === ph.id;
              return (
                <button
                  key={ph.id}
                  className={`phase-step-pill ${isCurrent ? 'active' : ''}`}
                  onClick={() => {
                    stopFiringPlay();
                    // Jump right into the peak visual moment of each phase
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
            >
              {isFiringPlaying ? <Pause size={15} /> : <Play size={15} />}
              <span>{isFiringPlaying ? '暂停' : '继续演示'}</span>
            </button>

            <div className="slider-wrapper">
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(fireProgress * 1000)}
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
                  {activeWeaponId === 'ak15' ? '导气开锁' : '出膛/开锁'}
                </span>
                <span style={{ left: '54%' }}>后坐抛壳</span>
                <span style={{ left: '78%' }}>推弹闭锁</span>
                <span style={{ left: '100%' }}>复位</span>
              </div>
            </div>

            <div className="pct-readout fire-readout">
              {Math.round(fireProgress * 100)}%
            </div>
          </div>
        </>
      )}
    </div>
  );
};
