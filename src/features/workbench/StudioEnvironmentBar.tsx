import React, { useEffect, useRef, useState } from 'react';
import {
  Aperture,
  ChevronDown,
  Droplets,
  EyeOff,
  Gauge,
  Lightbulb,
  Maximize2,
  Minimize2,
  Moon,
  Search,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';
import { useBrowserFullscreen } from '../../app/useFullscreen';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import {
  ARMORY_ENVIRONMENT_PRESETS,
  type ArmoryEnvironmentPreset,
} from '../../engine/canvas/GunsmithStageMat';
import { GRAPHICS_QUALITY_TIERS } from '../../engine/canvas/graphicsQuality';
import {
  ARMORY_WEAR_PRESETS,
  resolveWearPresetFromLevel,
} from '../../engine/materials/armoryShader';
import { COMMAND_PALETTE_STRINGS } from '../../i18n/commandPaletteStrings';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { useAppStore } from '../../store/useAppStore';
import { isMacLikePlatform } from './CommandPaletteModal';

export interface StudioEnvironmentBarProps {
  compact?: boolean;
  showCommandTrigger?: boolean;
}

const PRESET_ICONS: Record<ArmoryEnvironmentPreset, React.ReactNode> = {
  tactical_vault: <Moon size={11} aria-hidden="true" />,
  gunsmith_bench: <Lightbulb size={11} aria-hidden="true" />,
  blueprint_daylight: <Sun size={11} aria-hidden="true" />,
};

export const StudioEnvironmentBar: React.FC<StudioEnvironmentBarProps> = ({
  compact = false,
  showCommandTrigger = true,
}) => {
  const lang = useAppStore((s) => s.lang);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const setEnvironmentPreset = useAppStore((s) => s.setEnvironmentPreset);
  const postFxEnabled = useAppStore((s) => s.postFxEnabled);
  const togglePostFx = useAppStore((s) => s.togglePostFx);
  const weaponWearLevel = useAppStore((s) => s.weaponWearLevel);
  const setWeaponWearPreset = useAppStore((s) => s.setWeaponWearPreset);
  const graphicsQuality = useAppStore((s) => s.graphicsQuality);
  const setGraphicsQuality = useAppStore((s) => s.setGraphicsQuality);
  const setHudHidden = useAppStore((s) => s.setHudHidden);
  const openCommandPalette = useAppStore((s) => s.openCommandPalette);
  const hudHidden = useAppStore((s) => s.hudHidden);

  const [displayMenuOpen, setDisplayMenuOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const isDisplayMenuOpen = displayMenuOpen && !hudHidden;

  const activeWearPreset = resolveWearPresetFromLevel(weaponWearLevel);
  const hasCustomDisplaySetting =
    activeWearPreset !== 'field_oiled' ||
    !postFxEnabled ||
    graphicsQuality !== 'ultra';

  useEffect(() => {
    if (!isDisplayMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        popoverRef.current &&
        e.target instanceof Node &&
        !popoverRef.current.contains(e.target)
      ) {
        setDisplayMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setDisplayMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isDisplayMenuOpen]);

  const { isFullscreen, isSupported, toggleFullscreen } =
    useBrowserFullscreen();
  const studioUi = UI_STRINGS[lang].studio;
  const cmdUi = COMMAND_PALETTE_STRINGS[lang];
  const menuUi = cmdUi.workbenchMenus;
  const kbdHint = isMacLikePlatform()
    ? cmdUi.trigger.kbdMac
    : cmdUi.trigger.kbdOther;

  const handleFullscreenClick = async () => {
    playWorkbenchFoley('toggle_switch');
    if (!isSupported) {
      setHudHidden(true);
      return;
    }
    const wasFullscreen = isFullscreen;
    const activeAfter = await toggleFullscreen();
    if (!wasFullscreen && !activeAfter) {
      // Fallback to viewport-clean presentation if host container blocks native fullscreen
      setHudHidden(true);
    }
  };

  return (
    <div className={`studio-env-cluster ${compact ? 'is-compact' : ''}`}>
      {showCommandTrigger && (
        <button
          type="button"
          className="cmdk-trigger-pill"
          title={cmdUi.trigger.title}
          aria-label={cmdUi.trigger.ariaLabel}
          onClick={() => {
            playWorkbenchFoley('toggle_switch');
            setDisplayMenuOpen(false);
            openCommandPalette();
          }}
        >
          <Search size={12} aria-hidden="true" />
          <span className="cmdk-trigger-text">{cmdUi.trigger.shortLabel}</span>
          <kbd className="cmdk-trigger-kbd" aria-hidden="true">
            {kbdHint}
          </kbd>
        </button>
      )}

      <div
        className="env-switch-pill"
        role="group"
        aria-label={studioUi.envGroupAria}
      >
        {ARMORY_ENVIRONMENT_PRESETS.map((preset) => {
          const isActive = environmentPreset === preset;
          const copy = studioUi.presets[preset];
          return (
            <button
              key={preset}
              type="button"
              className={`env-seg-btn ${isActive ? 'active' : ''} env-${preset}`}
              aria-pressed={isActive}
              title={copy.title}
              onClick={() => {
                if (!isActive) {
                  playWorkbenchFoley('toggle_switch');
                  setEnvironmentPreset(preset);
                }
              }}
            >
              {PRESET_ICONS[preset]}
              <span>{copy.label}</span>
            </button>
          );
        })}
      </div>

      {/* Consolidated Display / Studio Quality & Wear Patina Popover */}
      <div ref={popoverRef} className="studio-popover-wrap">
        <button
          type="button"
          className={`toggle-chip studio-popover-trigger ${
            isDisplayMenuOpen ? 'active-cyan' : ''
          }`}
          aria-expanded={isDisplayMenuOpen}
          aria-haspopup="dialog"
          title={menuUi.studioBtnTitle}
          onClick={() => {
            playWorkbenchFoley('toggle_switch');
            setDisplayMenuOpen((prev) => !prev);
          }}
        >
          <SlidersHorizontal size={12} aria-hidden="true" />
          <span>{menuUi.studioBtnLabel}</span>
          {hasCustomDisplaySetting && !isDisplayMenuOpen && (
            <span className="popover-active-dot" aria-hidden="true" />
          )}
          <ChevronDown
            size={11}
            className={`popover-caret ${isDisplayMenuOpen ? 'is-open' : ''}`}
            aria-hidden="true"
          />
        </button>

        {isDisplayMenuOpen && (
          <div
            className="workbench-popover-menu studio-display-popover"
            role="dialog"
            aria-label={menuUi.studioPopoverAria}
          >
            <div className="popover-section">
              <div className="popover-section-head">
                <Droplets size={12} aria-hidden="true" />
                <span>{menuUi.studioWearHeading}</span>
              </div>
              <div
                className="popover-seg-row"
                role="group"
                aria-label={studioUi.wearGroupAria}
              >
                {ARMORY_WEAR_PRESETS.map((wearPreset) => {
                  const isActive = activeWearPreset === wearPreset;
                  const meta = studioUi.wearPresets[wearPreset];
                  return (
                    <button
                      key={wearPreset}
                      type="button"
                      className={`popover-seg-btn ${
                        isActive ? 'is-active' : ''
                      } wear-${wearPreset}`}
                      aria-pressed={isActive}
                      title={meta.title}
                      onClick={() => {
                        playWorkbenchFoley('toggle_switch');
                        setWeaponWearPreset(wearPreset);
                      }}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="popover-section">
              <div className="popover-section-head">
                <Gauge size={12} aria-hidden="true" />
                <span>{menuUi.studioQualityHeading}</span>
              </div>
              <div className="popover-seg-row">
                {GRAPHICS_QUALITY_TIERS.map((tier) => {
                  const isActive = graphicsQuality === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      className={`popover-seg-btn ${
                        isActive ? 'is-active' : ''
                      }`}
                      aria-pressed={isActive}
                      title={studioUi.qualityTitle(tier)}
                      onClick={() => {
                        playWorkbenchFoley('toggle_switch');
                        setGraphicsQuality(tier, true);
                      }}
                    >
                      {studioUi.qualityLabels[tier]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="popover-section popover-section-inline">
              <div className="popover-inline-copy">
                <div className="popover-section-head">
                  <Aperture size={12} aria-hidden="true" />
                  <span>{menuUi.studioPostFxHeading}</span>
                </div>
                <p className="popover-section-desc">
                  {menuUi.studioPostFxDesc}
                </p>
              </div>
              <button
                type="button"
                className={`toggle-chip postfx-chip ${
                  postFxEnabled ? 'active-cyan' : ''
                }`}
                aria-pressed={postFxEnabled}
                title={studioUi.postFxTitle(postFxEnabled)}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  togglePostFx();
                }}
              >
                <Aperture size={12} aria-hidden="true" />
                <span>{studioUi.postFxChip}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className="toggle-chip"
        title={studioUi.hideUiTitle}
        onClick={() => {
          playWorkbenchFoley('toggle_switch');
          setDisplayMenuOpen(false);
          setHudHidden(true);
        }}
      >
        <EyeOff size={13} aria-hidden="true" />
        <span>{studioUi.hideUiChip}</span>
      </button>

      <button
        type="button"
        className={`toggle-chip ${isFullscreen ? 'active-cyan' : ''}`}
        title={studioUi.fullscreenTitle(isFullscreen)}
        onClick={() => {
          setDisplayMenuOpen(false);
          void handleFullscreenClick();
        }}
      >
        {isFullscreen ? (
          <Minimize2 size={13} aria-hidden="true" />
        ) : (
          <Maximize2 size={13} aria-hidden="true" />
        )}
        <span>
          {isFullscreen
            ? studioUi.fullscreenExitChip
            : studioUi.fullscreenEnterChip}
        </span>
      </button>
    </div>
  );
};
