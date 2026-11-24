import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  FlipHorizontal2,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  X,
} from 'lucide-react';
import {
  clampSectionCutOffset,
  formatSectionOffsetMm,
  getAxisSectionCutRange,
  getDefaultSectionBoxParams,
  SECTION_CUT_AXES,
  SECTION_CUT_OFFSET_DEFAULT,
  type SectionCutAxis,
} from '../../engine/actors/StencilSectionCap';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import {
  isArcheryWeapon,
  isTankWeapon,
} from '../../engine/physics/armoryPhysics';
import { COMMAND_PALETTE_STRINGS } from '../../i18n/commandPaletteStrings';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import type { WeaponId, WeaponScaleProfile } from '../../weapons/types';

const SWEEP_ANGULAR_RAD_PER_SEC = 1.15;

export type LiveSectionPresetLabelKey =
  | 'center'
  | 'locking'
  | 'feed'
  | 'bore'
  | 'tankBreech'
  | 'tankAutoloader'
  | 'tankPowerpack'
  | 'archeryCam'
  | 'archeryLimb';

export interface LiveSectionQuickPreset {
  id: 'center' | 'locking' | 'feed' | 'bore';
  /** World cm offset strictly clamped to the active axis & scale range */
  offset: number;
  labelKey: LiveSectionPresetLabelKey;
}

/**
 * Computes scale-aware & axis-aware CT cutaway quick-slice presets.
 * Dynamically scales offsets between small arms / archery (`±25 mm` Z, `-380..+580 mm` X, `±180 mm` Y)
 * and 1:1 heavy armor / GAU-8 (`±1,800 mm` Z, `-4,200..+6,500 mm` X, `-1,150..+1,450 mm` Y).
 */
export function getLiveSectionQuickPresets(
  scaleProfile: WeaponScaleProfile | null | undefined,
  axis: Exclude<SectionCutAxis, 'box'> = 'z',
  weaponId?: WeaponId | string | null
): LiveSectionQuickPreset[] {
  const isHeavyScale = scaleProfile === 'main_battle_tank';
  const isTank = isTankWeapon(weaponId);
  const isArchery = isArcheryWeapon(weaponId);

  const lockingLabel: LiveSectionPresetLabelKey = isTank
    ? 'tankBreech'
    : isArchery
      ? 'archeryCam'
      : 'locking';
  const feedLabel: LiveSectionPresetLabelKey = isTank
    ? 'tankAutoloader'
    : isArchery
      ? 'archeryLimb'
      : 'feed';
  const boreLabel: LiveSectionPresetLabelKey = isTank
    ? 'tankPowerpack'
    : 'bore';

  let rawOffsets: readonly [number, number, number, number];
  if (isHeavyScale) {
    rawOffsets =
      axis === 'x'
        ? [0, 120, -120, -264]
        : axis === 'y'
          ? [0, 56, -32, 104]
          : [0, 48, -56, 116];
  } else {
    rawOffsets =
      axis === 'x'
        ? [0, 6.0, -6.0, 26.0]
        : axis === 'y'
          ? [0, 3.5, -4.5, 8.0]
          : [0, 0.85, -0.75, 1.65];
  }

  return [
    {
      id: 'center',
      offset: clampSectionCutOffset(rawOffsets[0], scaleProfile, axis),
      labelKey: 'center',
    },
    {
      id: 'locking',
      offset: clampSectionCutOffset(rawOffsets[1], scaleProfile, axis),
      labelKey: lockingLabel,
    },
    {
      id: 'feed',
      offset: clampSectionCutOffset(rawOffsets[2], scaleProfile, axis),
      labelKey: feedLabel,
    },
    {
      id: 'bore',
      offset: clampSectionCutOffset(rawOffsets[3], scaleProfile, axis),
      labelKey: boreLabel,
    },
  ];
}

export interface LiveSectionPlaneBarProps {
  /** Optional overrides for SSR/unit testing; runtime reads directly from `useAppStore`. */
  forceVisible?: boolean;
  offsetOverride?: number;
  axisOverride?: SectionCutAxis;
  weaponIdOverride?: WeaponId;
}

export const LiveSectionPlaneBar: React.FC<LiveSectionPlaneBarProps> = ({
  forceVisible,
  offsetOverride,
  axisOverride,
  weaponIdOverride,
}) => {
  const lang = useAppStore((s) => s.lang);
  const storeWeaponId = useAppStore((s) => s.activeWeaponId);
  const activeWeaponId = weaponIdOverride ?? storeWeaponId;
  const storeSectionCut = useAppStore((s) => s.sectionCut);
  const storeAxis = useAppStore((s) => s.sectionCutAxis);
  const sectionCutAxis = axisOverride ?? storeAxis;
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
  const [mobilePresetsOpen, setMobilePresetsOpen] = useState(false);
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
  const presetsUi = UI_STRINGS[lang].sectionPresets;
  const isStoryDrawerExpanded = storyOpen && !storyMinimized;
  const isBoxMode = sectionCutAxis === 'box';
  const quickPresets = isBoxMode
    ? []
    : getLiveSectionQuickPresets(scaleProfile, sectionCutAxis, activeWeaponId);
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
        isBoxMode ? 'is-box-mode' : 'has-presets'
      } ${isStoryDrawerExpanded ? 'is-story-open' : ''} ${
        mobilePresetsOpen ? 'is-mobile-presets-open' : ''
      }`}
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

          {!isBoxMode && quickPresets.length > 0 && (
            <button
              type="button"
              className={`live-section-btn live-section-presets-toggle ${
                mobilePresetsOpen ? 'is-active' : ''
              }`}
              data-testid="live-section-presets-toggle"
              aria-expanded={mobilePresetsOpen}
              title={presetsUi.groupAria}
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setMobilePresetsOpen((prev) => !prev);
              }}
            >
              <span>{lang === 'zh' ? '预设' : 'Presets'}</span>
              <ChevronDown size={11} aria-hidden="true" />
            </button>
          )}

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

      {!isBoxMode && quickPresets.length > 0 && (
        <div
          className="live-section-presets-row"
          role="group"
          aria-label={presetsUi.groupAria}
        >
          {quickPresets.map((preset) => {
            const isPresetActive =
              !activeSweeping &&
              Math.abs(sectionCutOffset - preset.offset) <=
                sectionRange.step * 0.55;
            const presetMm = formatSectionOffsetMm(
              preset.offset,
              scaleProfile,
              sectionCutAxis
            );
            return (
              <button
                key={preset.id}
                type="button"
                className={`live-section-preset-pill ${
                  isPresetActive ? 'is-active' : ''
                }`}
                aria-pressed={isPresetActive}
                data-section-preset={preset.id}
                title={`${presetsUi[preset.labelKey]} (${presetMm})`}
                onClick={() => {
                  setIsSweeping(false);
                  playWorkbenchFoley('preset_detent');
                  setSectionCutOffset(preset.offset);
                }}
              >
                <span className="live-section-preset-name">
                  {presetsUi[preset.labelKey]}
                </span>
                <span className="live-section-preset-mm">{presetMm}</span>
              </button>
            );
          })}
        </div>
      )}

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
