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
  SECTION_CUT_OFFSET_DEFAULT,
  SECTION_CUT_OFFSET_MAX,
  SECTION_CUT_OFFSET_MIN,
  SECTION_CUT_OFFSET_STEP,
} from '../../engine/actors/StencilSectionCap';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { COMMAND_PALETTE_STRINGS } from '../../i18n/commandPaletteStrings';
import { useAppStore } from '../../store/useAppStore';

const SWEEP_AMPLITUDE_CM = 2.15;
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
  const storeSectionCut = useAppStore((s) => s.sectionCut);
  const storeOffset = useAppStore((s) => s.sectionCutOffset);
  const sectionCut = forceVisible ?? storeSectionCut;
  const sectionCutOffset = offsetOverride ?? storeOffset;
  const sectionCutFlip = useAppStore((s) => s.sectionCutFlip);
  const setSectionCutOffset = useAppStore((s) => s.setSectionCutOffset);
  const resetSectionCutOffset = useAppStore((s) => s.resetSectionCutOffset);
  const toggleSectionCutFlip = useAppStore((s) => s.toggleSectionCutFlip);
  const setSectionCut = useAppStore((s) => s.setSectionCut);
  const storyOpen = useAppStore((s) => s.storyOpen);
  const storyMinimized = useAppStore((s) => s.storyMinimized);

  const [isSweeping, setIsSweeping] = useState(false);
  const phaseRef = useRef(0);
  const activeSweeping = isSweeping && sectionCut;

  // Smooth 60 FPS CT-Scan depth sweep via requestAnimationFrame (zero PartActor re-renders)
  useEffect(() => {
    if (!activeSweeping) return;

    const currentOffset = useAppStore.getState().sectionCutOffset;
    const clampedRatio = Math.max(
      -1,
      Math.min(1, currentOffset / SWEEP_AMPLITUDE_CM)
    );
    phaseRef.current = Math.asin(clampedRatio);

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - lastTs) / 1000, 0.05);
      lastTs = now;
      phaseRef.current += dt * SWEEP_ANGULAR_RAD_PER_SEC;
      const nextVal = Math.sin(phaseRef.current) * SWEEP_AMPLITUDE_CM;
      useAppStore.getState().setSectionCutOffset(nextVal);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [activeSweeping]);

  if (!sectionCut) return null;

  const ui = COMMAND_PALETTE_STRINGS[lang].sectionPlane;
  const isStoryDrawerExpanded = storyOpen && !storyMinimized;
  const isCentered =
    Math.abs(sectionCutOffset - SECTION_CUT_OFFSET_DEFAULT) < 0.005 &&
    !sectionCutFlip;
  const depthText = formatSectionOffsetMm(sectionCutOffset);
  const pct =
    ((sectionCutOffset - SECTION_CUT_OFFSET_MIN) /
      (SECTION_CUT_OFFSET_MAX - SECTION_CUT_OFFSET_MIN)) *
    100;

  return (
    <div
      className={`live-section-bar ${
        isStoryDrawerExpanded ? 'is-story-open' : ''
      }`}
      role="region"
      aria-label={ui.barAria}
    >
      <div className="live-section-head">
        <span className="live-section-dot" aria-hidden="true" />
        <Scissors size={12} className="live-section-icon" aria-hidden="true" />
        <span className="live-section-title">{ui.label}</span>
        <span className="live-section-readout" title={ui.depthTitle}>
          {depthText}
        </span>
      </div>

      <div className="live-section-track-wrap">
        <span className="live-section-center-tick" aria-hidden="true" />
        <input
          type="range"
          className="live-section-slider"
          aria-label={ui.sliderAria}
          min={SECTION_CUT_OFFSET_MIN}
          max={SECTION_CUT_OFFSET_MAX}
          step={SECTION_CUT_OFFSET_STEP}
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

      <div className="live-section-actions">
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
          <span>{sectionCutFlip ? ui.flipLeftLabel : ui.flipRightLabel}</span>
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
  );
};
