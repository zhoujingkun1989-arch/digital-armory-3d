import React, { useEffect, useRef, useState } from 'react';
import {
  FlipHorizontal2,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  X,
} from 'lucide-react';
import {
  formatSectionOffsetMm,
  getAxisSectionCutRange,
  getDefaultSectionBoxParams,
  SECTION_CUT_AXES,
  SECTION_CUT_OFFSET_DEFAULT,
  type SectionCutAxis,
} from '../../engine/actors/StencilSectionCap';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { COMMAND_PALETTE_STRINGS } from '../../i18n/commandPaletteStrings';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';

const SWEEP_ANGULAR_RAD_PER_SEC = 1.15;

export interface LiveSectionPlaneBarProps {
  /** Optional overrides for SSR/unit testing; runtime reads directly from `useAppStore`. */
  forceVisible?: boolean;
  offsetOverride?: number;
}

export const LiveSectionPlaneBar: React.FC<LiveSectionPlaneBarProps> = ({
  forceVisible,
  offsetOverride,
}) => {
  const lang = useAppStore((s) => s.lang);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const storeSectionCut = useAppStore((s) => s.sectionCut);
  const sectionCutAxis = useAppStore((s) => s.sectionCutAxis);
  const setSectionCutAxis = useAppStore((s) => s.setSectionCutAxis);
  const storeOffset = useAppStore((s) => s.sectionCutOffset);
  const sectionCut = forceVisible ?? storeSectionCut;
  const sectionCutOffset = offsetOverride ?? storeOffset;
  const sectionCutFlip = useAppStore((s) => s.sectionCutFlip);
  const sectionBoxCenter = useAppStore((s) => s.sectionBoxCenter);
  const sectionBoxHalfSize = useAppStore((s) => s.sectionBoxHalfSize);
  const setSectionBoxCenter = useAppStore((s) => s.setSectionBoxCenter);
  const setSectionBoxHalfSize = useAppStore((s) => s.setSectionBoxHalfSize);
  const setSectionCutOffset = useAppStore((s) => s.setSectionCutOffset);
  const resetSectionCutOffset = useAppStore((s) => s.resetSectionCutOffset);
  const toggleSectionCutFlip = useAppStore((s) => s.toggleSectionCutFlip);
  const setSectionCut = useAppStore((s) => s.setSectionCut);
  const storyOpen = useAppStore((s) => s.storyOpen);
  const storyMinimized = useAppStore((s) => s.storyMinimized);

  const scaleProfile = getWeaponManifest(activeWeaponId).workbenchMeta.scaleProfile;
  const sectionRange = getAxisSectionCutRange(sectionCutAxis, scaleProfile);
  const boxBounds = getDefaultSectionBoxParams(scaleProfile);
  const sweepAmplitudeCm = sectionRange.sweepAmplitude;

  const [isSweeping, setIsSweeping] = useState(false);
  const phaseRef = useRef(0);
  const activeSweeping =
    isSweeping && sectionCut && sectionCutAxis !== 'box';

  // Smooth 60 FPS CT-Scan depth sweep via requestAnimationFrame (zero PartActor re-renders)
  useEffect(() => {
    if (!activeSweeping) return;

    const currentOffset = useAppStore.getState().sectionCutOffset;
    const clampedRatio = Math.max(
      -1,
      Math.min(1, currentOffset / sweepAmplitudeCm)
    );
    phaseRef.current = Math.asin(clampedRatio);

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - lastTs) / 1000, 0.05);
      lastTs = now;
      phaseRef.current += dt * SWEEP_ANGULAR_RAD_PER_SEC;
      const nextVal = Math.sin(phaseRef.current) * sweepAmplitudeCm;
      useAppStore.getState().setSectionCutOffset(nextVal);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [activeSweeping, sweepAmplitudeCm]);

  if (!sectionCut) return null;

  const ui = COMMAND_PALETTE_STRINGS[lang].sectionPlane;
  const isStoryDrawerExpanded = storyOpen && !storyMinimized;
  const isBoxMode = sectionCutAxis === 'box';
  const isCentered = isBoxMode
    ? Math.abs(sectionBoxCenter[0] - boxBounds.center[0]) < 1e-3 &&
      Math.abs(sectionBoxCenter[1] - boxBounds.center[1]) < 1e-3 &&
      Math.abs(sectionBoxCenter[2] - boxBounds.center[2]) < 1e-3 &&
      Math.abs(sectionBoxHalfSize[0] - boxBounds.halfSize[0]) < 1e-3
    : Math.abs(sectionCutOffset - SECTION_CUT_OFFSET_DEFAULT) <
        sectionRange.step * 0.1 && !sectionCutFlip;
  const depthText = isBoxMode
    ? `${Math.round(sectionBoxHalfSize[0] * 20)}×${Math.round(sectionBoxHalfSize[1] * 20)}×${Math.round(sectionBoxHalfSize[2] * 20)} mm`
    : formatSectionOffsetMm(sectionCutOffset, scaleProfile, sectionCutAxis);
  const pct =
    ((sectionCutOffset - sectionRange.min) /
      Math.max(1e-6, sectionRange.max - sectionRange.min)) *
    100;

  const flipLabel =
    sectionCutAxis === 'x'
      ? sectionCutFlip
        ? ui.flipXBackwardLabel
        : ui.flipXForwardLabel
      : sectionCutAxis === 'y'
        ? sectionCutFlip
          ? ui.flipYBottomLabel
          : ui.flipYTopLabel
        : sectionCutFlip
          ? ui.flipLeftLabel
          : ui.flipRightLabel;

  const updateBoxCenter = (axisIdx: 0 | 1 | 2, val: number) => {
    const next: [number, number, number] = [
      sectionBoxCenter[0],
      sectionBoxCenter[1],
      sectionBoxCenter[2],
    ];
    next[axisIdx] = val;
    setSectionBoxCenter(next);
  };

  const updateBoxHalf = (val: number) => {
    const ratio = val / Math.max(0.5, boxBounds.halfSize[0]);
    setSectionBoxHalfSize([
      val,
      Math.max(
        boxBounds.minHalf[1],
        Math.min(boxBounds.maxHalf[1], boxBounds.halfSize[1] * ratio)
      ),
      Math.max(
        boxBounds.minHalf[2],
        Math.min(boxBounds.maxHalf[2], boxBounds.halfSize[2] * ratio)
      ),
    ]);
  };

  return (
    <div
      className={`live-section-bar ${
        isBoxMode ? 'is-box-mode' : ''
      } ${isStoryDrawerExpanded ? 'is-story-open' : ''}`}
      role="region"
      aria-label={ui.barAria}
    >
      <div className="live-section-main-row">
        <div className="live-section-head">
          <span className="live-section-dot" aria-hidden="true" />
          <Scissors size={12} className="live-section-icon" aria-hidden="true" />
          <span className="live-section-title">{ui.label}</span>
          <span className="live-section-readout" title={ui.depthTitle}>
            {depthText}
          </span>
        </div>

        <div className="live-section-axis-group" role="group" aria-label={ui.label}>
          {SECTION_CUT_AXES.map((ax: SectionCutAxis) => {
            const active = sectionCutAxis === ax;
            return (
              <button
                key={ax}
                type="button"
                className={`live-section-axis-pill ${active ? 'is-active' : ''}`}
                aria-pressed={active}
                title={ui.axisTitles[ax]}
                onClick={() => {
                  setIsSweeping(false);
                  playWorkbenchFoley('preset_detent');
                  setSectionCutAxis(ax);
                }}
              >
                {ui.axisLabels[ax]}
              </button>
            );
          })}
        </div>

        {!isBoxMode && (
          <div className="live-section-track-wrap">
            <span className="live-section-center-tick" aria-hidden="true" />
            <input
              type="range"
              className="live-section-slider"
              aria-label={ui.sliderAria}
              min={sectionRange.min}
              max={sectionRange.max}
              step={sectionRange.step}
              value={sectionCutOffset}
              style={
                {
                  '--section-pct': `${pct.toFixed(1)}%`,
                } as React.CSSProperties
              }
              onPointerDown={() => {
                if (isSweeping) setIsSweeping(false);
              }}
              onChange={(e) => {
                if (isSweeping) setIsSweeping(false);
                setSectionCutOffset(Number(e.target.value));
              }}
            />
          </div>
        )}

        <div className="live-section-actions">
          {!isBoxMode && (
            <>
              <button
                type="button"
                className={`live-section-btn ${sectionCutFlip ? 'is-active' : ''}`}
                aria-pressed={sectionCutFlip}
                title={ui.flipTitle}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  toggleSectionCutFlip();
                }}
              >
                <FlipHorizontal2 size={12} aria-hidden="true" />
                <span>{flipLabel}</span>
              </button>

              <button
                type="button"
                className={`live-section-btn ${activeSweeping ? 'is-scanning' : ''}`}
                aria-pressed={activeSweeping}
                title={ui.scanTitle}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setIsSweeping((prev) => !prev);
                }}
              >
                {activeSweeping ? (
                  <Pause size={11} aria-hidden="true" />
                ) : (
                  <Play size={11} aria-hidden="true" />
                )}
                <span>{activeSweeping ? ui.scanStopLabel : ui.scanStartLabel}</span>
              </button>
            </>
          )}

          <button
            type="button"
            className="live-section-btn"
            disabled={isCentered && !activeSweeping}
            title={ui.resetTitle}
            onClick={() => {
              setIsSweeping(false);
              playWorkbenchFoley('preset_detent');
              resetSectionCutOffset();
            }}
          >
            <RotateCcw size={11} aria-hidden="true" />
            <span>{ui.resetLabel}</span>
          </button>

          <button
            type="button"
            className="live-section-close"
            aria-label={ui.closeTitle}
            title={ui.closeTitle}
            onClick={() => {
              setIsSweeping(false);
              playWorkbenchFoley('toggle_switch');
              setSectionCut(false);
            }}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      </div>

      {isBoxMode && (
        <div className="live-section-box-row">
          <label className="live-section-box-ctrl">
            <span>{ui.boxAxisX}</span>
            <input
              type="range"
              className="live-section-box-slider"
              min={boxBounds.minCenter[0]}
              max={boxBounds.maxCenter[0]}
              step={boxBounds.step}
              value={sectionBoxCenter[0]}
              onChange={(e) => updateBoxCenter(0, Number(e.target.value))}
            />
          </label>
          <label className="live-section-box-ctrl">
            <span>{ui.boxAxisY}</span>
            <input
              type="range"
              className="live-section-box-slider"
              min={boxBounds.minCenter[1]}
              max={boxBounds.maxCenter[1]}
              step={boxBounds.step}
              value={sectionBoxCenter[1]}
              onChange={(e) => updateBoxCenter(1, Number(e.target.value))}
            />
          </label>
          <label className="live-section-box-ctrl">
            <span>{ui.boxAxisZ}</span>
            <input
              type="range"
              className="live-section-box-slider"
              min={boxBounds.minCenter[2]}
              max={boxBounds.maxCenter[2]}
              step={boxBounds.step}
              value={sectionBoxCenter[2]}
              onChange={(e) => updateBoxCenter(2, Number(e.target.value))}
            />
          </label>
          <label className="live-section-box-ctrl">
            <span>{ui.boxSpanLabel}</span>
            <input
              type="range"
              className="live-section-box-slider"
              min={boxBounds.minHalf[0]}
              max={boxBounds.maxHalf[0]}
              step={boxBounds.step}
              value={sectionBoxHalfSize[0]}
              onChange={(e) => updateBoxHalf(Number(e.target.value))}
            />
          </label>
        </div>
      )}
    </div>
  );
};
